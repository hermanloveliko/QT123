import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { prisma } from "./prisma";

const app = express();
const PORT = Number(process.env.API_PORT || 8787);
const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";
const WEB_ORIGINS = Array.from(
  new Set(
    String(process.env.WEB_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
);
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "dev-secret";
const AI_KNOWLEDGE_DIR = process.env.AI_KNOWLEDGE_DIR || "C:\\Users\\李\\Desktop\\网站修改方向\\AI训练资料";
const AI_KNOWLEDGE_MAX_CHARS = Number(process.env.AI_KNOWLEDGE_MAX_CHARS || 16000);

type LoadedKnowledge = {
  file: string;
  content: string;
};

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadAiKnowledge(): LoadedKnowledge[] {
  try {
    if (!fs.existsSync(AI_KNOWLEDGE_DIR)) return [];
    const files = fs.readdirSync(AI_KNOWLEDGE_DIR);
    const docs: LoadedKnowledge[] = [];
    for (const f of files) {
      const full = path.join(AI_KNOWLEDGE_DIR, f);
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      if (!/\.(txt|md|html|htm)$/i.test(f)) continue;
      const raw = fs.readFileSync(full, "utf8");
      const content = /\.(html|htm)$/i.test(f) ? stripHtml(raw) : raw.replace(/\s+/g, " ").trim();
      if (!content) continue;
      docs.push({ file: f, content });
    }
    return docs;
  } catch (err) {
    console.error("[ai] load knowledge failed:", err);
    return [];
  }
}

const AI_KNOWLEDGE_DOCS = loadAiKnowledge();
const AI_KNOWLEDGE_TEXT = (() => {
  if (AI_KNOWLEDGE_DOCS.length === 0) return "";
  const merged = AI_KNOWLEDGE_DOCS
    .map((d) => `[资料:${d.file}]\n${d.content}`)
    .join("\n\n");
  return merged.slice(0, AI_KNOWLEDGE_MAX_CHARS);
})();

/** 用于从用户输入中匹配目录产品（忽略空格与常见标点差异） */
function normalizeProductMatchText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，,、．。．·•（）()]/g, "");
}

/** 用户提到多款产品时全部返回；长名称优先，避免短词误匹配 */
function findMentionedProducts<T extends { id: string; name: string }>(
  message: string,
  products: T[],
): T[] {
  const normMsg = normalizeProductMatchText(message);
  if (!normMsg) return [];
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of sorted) {
    const normName = normalizeProductMatchText(p.name);
    if (normName.length < 2) continue;
    let hit = false;
    if (normMsg.includes(normName)) hit = true;
    else if (
      normName.length >= 4 &&
      normMsg.length >= 3 &&
      normMsg.length < normName.length &&
      normName.includes(normMsg)
    ) {
      hit = true;
    }
    if (hit && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (origin === WEB_ORIGIN) return cb(null, true);
      if (WEB_ORIGINS.includes(origin)) return cb(null, true);
      if (/^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      if (/^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin)) return cb(null, true);
      // 允许直接用服务器 IP/域名访问前端（例如 http://43.162.107.11），
      // 当前端与 API 不同端口时（80 vs 8787）会触发 CORS，需要放行该来源。
      if (/^https?:\/\/\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(origin)) return cb(null, true);
      // 允许域名访问（建议通过 WEB_ORIGINS 配置更精确）
      if (/^https?:\/\/(?:www\.)?qingtai-group\.store(?::\d+)?$/i.test(origin)) return cb(null, true);
      return cb(new Error("CORS blocked"), false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve("uploads")));

const SUPPORTED_LANGS = ["zh", "en", "fr", "es", "pt", "ru", "ko", "ms", "th", "vi", "ar", "sw"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];
const DEFAULT_LANG: Lang = "zh";
const FALLBACK_LANG: Lang = "en";

function resolveLang(req: express.Request): { lang: Lang; fallback: Lang } {
  const q = String(req.query.lang || "").trim().toLowerCase();
  const h = String(req.headers["accept-language"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const raw = (q || h) as Lang;
  const lang = (SUPPORTED_LANGS as readonly string[]).includes(raw) ? raw : DEFAULT_LANG;
  return { lang, fallback: FALLBACK_LANG };
}

function pickLocalized<T extends { lang: any }>(
  rows: T[] | null | undefined,
  lang: Lang,
  fallback: Lang,
): T | undefined {
  const arr = rows || [];
  return arr.find((r) => String(r.lang) === lang) || arr.find((r) => String(r.lang) === fallback) || undefined;
}

function isSupportedLang(raw: string): raw is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(raw);
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function blankStringsDeep(value: unknown): unknown {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(blankStringsDeep);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = blankStringsDeep(v);
    return out;
  }
  return value;
}

function collectStringsDeep(value: unknown, out: string[]) {
  if (typeof value === "string") {
    const s = value.trim();
    if (s) out.push(s);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStringsDeep(v, out);
    return;
  }
  if (isPlainObject(value)) {
    for (const v of Object.values(value)) collectStringsDeep(v, out);
  }
}

function replaceStringsDeep(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === "string") return map.get(value.trim()) ?? value;
  if (Array.isArray(value)) return value.map((v) => replaceStringsDeep(v, map));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceStringsDeep(v, map);
    return out;
  }
  return value;
}

async function deepseekTranslateStrings(opts: { targetLang: Lang; texts: string[] }): Promise<string[]> {
  const { targetLang, texts } = opts;
  if (texts.length === 0) return [];
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY 未配置，无法机器翻译");
  }
  const systemPrompt =
    "You are a translation engine.\n"
    + "Translate each input string into the TARGET LANGUAGE, keeping the original array order.\n"
    + "Your output MUST be a strict JSON array of strings. Output ONLY the array, no extra text.\n\n"
    + "你是一个翻译引擎。\n"
    + "把输入的字符串逐条翻译成【目标语言】，保持原数组顺序。\n"
    + "输出必须是严格 JSON 字符串数组（只输出数组，不要解释，不要 Markdown）。\n\n"
    + `TARGET LANGUAGE / 目标语言：${targetLang}\n`
    + "Rules / 要求：\n"
    + "- Preserve numbers, units, model names (e.g. M4), currency symbols\n"
    + "- If a string does not need translation, return it as-is\n";

  const userPrompt = JSON.stringify({ texts }, null, 0);

  const callOnce = async (extraRule?: string) => {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt + (extraRule ? `\n${extraRule}\n` : "") },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
      }),
    });
    const data = (await r.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("机器翻译失败：无返回内容");
    return content;
  };

  const tryParseArray = (content: string): string[] => {
    let arr: unknown = null;
    try {
      arr = JSON.parse(content);
    } catch {
      const m = content.match(/\[[\s\S]*\]/);
      if (!m) throw new Error("机器翻译失败：返回不是 JSON 数组");
      arr = JSON.parse(m[0]);
    }
    if (!Array.isArray(arr)) throw new Error("机器翻译失败：返回不是数组");
    const out = arr.map((x) => String(x ?? ""));
    if (out.length !== texts.length) throw new Error("机器翻译失败：返回条数不一致");
    return out;
  };

  // Retry once with stricter rule; some languages may trigger verbose outputs.
  const first = await callOnce();
  try {
    return tryParseArray(first);
  } catch {
    const second = await callOnce("STRICT: Output ONLY a JSON array of strings, no other characters.");
    return tryParseArray(second);
  }
}

async function translateJsonValue(opts: { targetLang: Lang; value: unknown }): Promise<unknown> {
  const strings: string[] = [];
  collectStringsDeep(opts.value, strings);
  const uniq = Array.from(new Set(strings));
  // batch to avoid token limits
  const BATCH = 40;
  const mapping = new Map<string, string>();
  for (let i = 0; i < uniq.length; i += BATCH) {
    const chunk = uniq.slice(i, i + BATCH);
    const translated = await deepseekTranslateStrings({ targetLang: opts.targetLang, texts: chunk });
    for (let j = 0; j < chunk.length; j++) mapping.set(chunk[j], translated[j]);
  }
  return replaceStringsDeep(opts.value, mapping);
}

const uploadsDir = path.resolve("uploads");
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("仅支持 JPEG、PNG、WebP、GIF 图片"));
  },
});
const videoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^video\/(mp4|webm)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("仅支持 MP4、WebM 视频"));
  },
});

type AuthedRequest = express.Request & { admin?: { id: string; username: string } };
function auth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const bearer = req.headers.authorization?.replace("Bearer ", "");
  const token = req.cookies.admin_token || bearer;
  if (!token) return res.status(401).json({ message: "未登录" });
  try {
    req.admin = jwt.verify(token, ADMIN_JWT_SECRET) as { id: string; username: string };
    next();
  } catch {
    return res.status(401).json({ message: "登录已过期" });
  }
}

function computeCbm(p: { cbmPerUnit: any; lengthCm: number | null; widthCm: number | null; heightCm: number | null }) {
  if (p.cbmPerUnit != null) return Number(p.cbmPerUnit);
  if (p.lengthCm && p.widthCm && p.heightCm) return (p.lengthCm * p.widthCm * p.heightCm) / 1000000;
  return 0;
}

const PUBLIC_SITE_SETTING_KEYS = [
  "contact",
  "home.consultation",
  "home.systems",
  "home.projects",
  "home.logistics",
  "footer",
  "catalog.customSpec",
  "about.page",
] as const;

const quoteItemsSchema = z.object({
  portId: z.string().optional().nullable(),
  items: z.array(z.object({ productId: z.string(), qty: z.number().int().positive() })).min(1),
});

type CartLineInput = { productId: string; qty: number };

async function computePricingForItems(
  portId: string | null | undefined,
  items: CartLineInput[],
  opts?: { lang: Lang; fallback: Lang },
) {
  const lang = opts?.lang ?? DEFAULT_LANG;
  const fallback = opts?.fallback ?? FALLBACK_LANG;
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    include: { i18n: { where: { lang: { in: [lang as any, fallback as any] } } } },
  });
  const pm = new Map(products.map((p) => [p.id, p]));
  let totalCbm = 0;
  let itemsTotal = 0;
  const lineItems: Array<{
    productId: string;
    qty: number;
    unitPriceUsd: any;
    cbmPerUnit: number | null;
    lineCbm: number;
    lineTotalUsd: number;
    productName: string;
  }> = [];

  for (const it of items) {
    const p = pm.get(it.productId);
    if (!p) throw new Error(`产品不存在: ${it.productId}`);
    const loc = pickLocalized((p as any).i18n, lang, fallback);
    const unitCbm = computeCbm(p);
    const lineCbm = unitCbm * it.qty;
    const lineTotalUsd = Number(p.priceUsd) * it.qty;
    totalCbm += lineCbm;
    itemsTotal += lineTotalUsd;
    lineItems.push({
      productId: p.id,
      qty: it.qty,
      unitPriceUsd: p.priceUsd,
      cbmPerUnit: unitCbm || null,
      lineCbm,
      lineTotalUsd,
      productName: (loc as any)?.name ?? p.name,
    });
  }

  const rule = portId ? await prisma.pricingRule.findUnique({ where: { portId } }) : null;
  const minBillable = rule?.minBillableCbm ? Number(rule.minBillableCbm) : 0;
  const billableCbm = Math.max(totalCbm, minBillable);
  const freightUsd = rule ? billableCbm * Number(rule.usdPerCbm) : 0;
  const fixedFees = (rule?.fixedFees as Array<{ name: string; amountUsd: number }> | null) || [];
  const fixedFeesTotalUsd = fixedFees.reduce((a, c) => a + Number(c.amountUsd || 0), 0);
  const totalUsd = itemsTotal + freightUsd + fixedFeesTotalUsd;

  return {
    totalCbm,
    billableCbm,
    itemsTotalUsd: itemsTotal,
    freightUsd,
    fixedFees,
    fixedFeesTotalUsd,
    totalUsd,
    lineItems,
  };
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/public/site-settings", async (req, res) => {
  const { lang, fallback } = resolveLang(req);
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [...PUBLIC_SITE_SETTING_KEYS] } },
    include: { i18n: { where: { lang: { in: [lang as any, fallback as any] } } } },
  });
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    const loc = pickLocalized(row.i18n, lang, fallback);
    map[row.key] = (loc as any)?.value ?? row.value;
  }
  res.json(map);
});

app.post("/api/admin/login", async (req, res) => {
  const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误" });
  const { username, password } = parsed.data;
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user) return res.status(401).json({ message: "账号或密码错误" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "账号或密码错误" });
  const token = jwt.sign({ id: user.id, username: user.username }, ADMIN_JWT_SECRET, { expiresIn: "7d" });
  // Dev 下前端/后端不同端口：需要 SameSite=None 才能跨站带 cookie
  res.cookie("admin_token", token, { httpOnly: true, sameSite: "none", secure: false });
  return res.json({ token, user: { id: user.id, username: user.username } });
});

app.post("/api/admin/logout", (_req, res) => {
  res.clearCookie("admin_token");
  res.json({ ok: true });
});

app.get("/api/admin/me", auth, (req: AuthedRequest, res) => res.json({ user: req.admin }));

app.get("/api/admin/site-settings", auth, async (_req, res) => {
  const rows = await prisma.siteSetting.findMany({ orderBy: { key: "asc" } });
  res.json(rows);
});
app.put("/api/admin/site-settings/:key", auth, async (req, res) => {
  const key = req.params.key;
  const value = req.body?.value ?? req.body;
  const row = await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  res.json(row);
});

// i18n site-settings: non-default languages stored in SiteSettingI18n
app.get("/api/admin/site-settings-i18n", auth, async (req, res) => {
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) {
    return res.status(400).json({ message: "lang 参数错误" });
  }
  const rows = await prisma.siteSettingI18n.findMany({
    where: { lang: lang as any },
    orderBy: { key: "asc" },
  });
  res.json(rows.map((r) => ({ key: r.key, value: r.value })));
});

app.put("/api/admin/site-settings-i18n/:key", auth, async (req, res) => {
  const key = req.params.key;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) {
    return res.status(400).json({ message: "lang 参数错误" });
  }
  if (lang === DEFAULT_LANG) {
    return res.status(400).json({ message: "默认语言请使用 /api/admin/site-settings 保存" });
  }
  const value = req.body?.value ?? req.body;
  // Ensure base row exists for FK
  await prisma.siteSetting.upsert({ where: { key }, update: {}, create: { key, value: {} } });
  const row = await prisma.siteSettingI18n.upsert({
    where: { key_lang: { key, lang: lang as any } },
    update: { value },
    create: { key, lang: lang as any, value },
  });
  res.json({ key: row.key, value: row.value, lang: row.lang });
});

app.post("/api/admin/i18n/batch", auth, async (req, res) => {
  const schema = z.object({
    entity: z.enum(["siteSettings", "products", "categories", "subcategories", "countries", "ports"]),
    lang: z.string().min(2),
    mode: z.enum(["empty", "copyZh", "machine"]),
    force: z.boolean().optional().default(false),
    // optional filters
    keys: z.array(z.string()).optional(),
    ids: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  const langRaw = parsed.data.lang.trim().toLowerCase();
  if (!isSupportedLang(langRaw)) return res.status(400).json({ message: "lang 参数错误" });
  const lang = langRaw as Lang;
  if (lang === DEFAULT_LANG) return res.status(400).json({ message: "默认语言无需批量 i18n" });

  const { entity, mode, force } = parsed.data;
  const failures: Array<{ id?: string; key?: string; message: string }> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    if (entity === "siteSettings") {
      const wantedKeys = parsed.data.keys?.length ? parsed.data.keys : [...PUBLIC_SITE_SETTING_KEYS];
      const baseRows = await prisma.siteSetting.findMany({ where: { key: { in: wantedKeys } } });
      for (const row of baseRows) {
        try {
          const existing = await prisma.siteSettingI18n.findUnique({
            where: { key_lang: { key: row.key, lang: lang as any } },
          });
          if (existing && !force) {
            skipped++;
            continue;
          }
          const baseValue = row.value as any;
          let nextValue: unknown = baseValue;
          if (mode === "empty") nextValue = blankStringsDeep(baseValue);
          else if (mode === "copyZh") nextValue = baseValue;
          else if (mode === "machine") nextValue = await translateJsonValue({ targetLang: lang, value: baseValue });

          await prisma.siteSetting.upsert({ where: { key: row.key }, update: {}, create: { key: row.key, value: {} } });
          if (existing) {
            await prisma.siteSettingI18n.update({
              where: { key_lang: { key: row.key, lang: lang as any } },
              data: { value: nextValue as any },
            });
            updated++;
          } else {
            await prisma.siteSettingI18n.create({
              data: { key: row.key, lang: lang as any, value: nextValue as any },
            });
            created++;
          }
        } catch (e: any) {
          failures.push({ key: row.key, message: e?.message || "failed" });
        }
      }
      return res.json({ ok: true, entity, lang, mode, created, updated, skipped, failures });
    }

    if (entity === "products") {
      const baseRows = await prisma.product.findMany({
        where: parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : undefined,
        include: { i18n: { where: { lang: lang as any } } },
      });
      for (const p of baseRows) {
        try {
          const existing = await prisma.productI18n.findUnique({
            where: { productId_lang: { productId: p.id, lang: lang as any } },
          });
          if (existing && !force) {
            skipped++;
            continue;
          }
          let name = p.name;
          let description = p.description || "";
          let specs = (Array.isArray(p.specs) ? p.specs : []) as any[];
          if (mode === "empty") {
            name = "";
            description = "";
            specs = [];
          } else if (mode === "machine") {
            const texts: string[] = [p.name, p.description || "", ...(Array.isArray(p.specs) ? (p.specs as any[]).map(String) : [])].filter(
              (x) => String(x || "").trim() !== "",
            );
            const translated = await deepseekTranslateStrings({ targetLang: lang, texts });
            let idx = 0;
            name = translated[idx++] || p.name;
            description = (p.description || "").trim() ? (translated[idx++] || "") : "";
            const rest = translated.slice(idx);
            specs = rest;
          }
          const row = await prisma.productI18n.upsert({
            where: { productId_lang: { productId: p.id, lang: lang as any } },
            update: { name, description, specs: specs as any },
            create: { productId: p.id, lang: lang as any, name, description, specs: specs as any },
          });
          if (existing) updated++;
          else created++;
          void row;
        } catch (e: any) {
          failures.push({ id: p.id, message: e?.message || "failed" });
        }
      }
      return res.json({ ok: true, entity, lang, mode, created, updated, skipped, failures });
    }

    if (entity === "categories") {
      const rows = await prisma.category.findMany({ where: parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : undefined });
      const targets: Array<{ id: string; baseName: string }> = [];
      const existed = new Map<string, boolean>();
      for (const c of rows) {
        try {
          const existing = await prisma.categoryI18n.findUnique({
            where: { categoryId_lang: { categoryId: c.id, lang: lang as any } },
          });
          if (existing && !force) {
            skipped++;
            continue;
          }
          existed.set(c.id, Boolean(existing));
          targets.push({ id: c.id, baseName: c.name });
        } catch (e: any) {
          failures.push({ id: c.id, message: e?.message || "failed" });
        }
      }
      let translatedNames: string[] = [];
      if (mode === "machine") {
        const names = targets.map((t) => t.baseName);
        const BATCH = 40;
        for (let i = 0; i < names.length; i += BATCH) {
          const chunk = names.slice(i, i + BATCH);
          const out = await deepseekTranslateStrings({ targetLang: lang, texts: chunk });
          translatedNames.push(...out);
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          let name = t.baseName;
          if (mode === "empty") name = "";
          else if (mode === "machine") name = translatedNames[i] || t.baseName;
          await prisma.categoryI18n.upsert({
            where: { categoryId_lang: { categoryId: t.id, lang: lang as any } },
            update: { name },
            create: { categoryId: t.id, lang: lang as any, name },
          });
          if (existed.get(t.id)) updated++;
          else created++;
        } catch (e: any) {
          failures.push({ id: t.id, message: e?.message || "failed" });
        }
      }
      return res.json({ ok: true, entity, lang, mode, created, updated, skipped, failures });
    }

    if (entity === "subcategories") {
      const rows = await prisma.subcategory.findMany({ where: parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : undefined });
      const targets: Array<{ id: string; baseName: string }> = [];
      const existed = new Map<string, boolean>();
      for (const c of rows) {
        try {
          const existing = await prisma.subcategoryI18n.findUnique({
            where: { subcategoryId_lang: { subcategoryId: c.id, lang: lang as any } },
          });
          if (existing && !force) {
            skipped++;
            continue;
          }
          existed.set(c.id, Boolean(existing));
          targets.push({ id: c.id, baseName: c.name });
        } catch (e: any) {
          failures.push({ id: c.id, message: e?.message || "failed" });
        }
      }
      let translatedNames: string[] = [];
      if (mode === "machine") {
        const names = targets.map((t) => t.baseName);
        const BATCH = 40;
        for (let i = 0; i < names.length; i += BATCH) {
          const chunk = names.slice(i, i + BATCH);
          const out = await deepseekTranslateStrings({ targetLang: lang, texts: chunk });
          translatedNames.push(...out);
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          let name = t.baseName;
          if (mode === "empty") name = "";
          else if (mode === "machine") name = translatedNames[i] || t.baseName;
          await prisma.subcategoryI18n.upsert({
            where: { subcategoryId_lang: { subcategoryId: t.id, lang: lang as any } },
            update: { name },
            create: { subcategoryId: t.id, lang: lang as any, name },
          });
          if (existed.get(t.id)) updated++;
          else created++;
        } catch (e: any) {
          failures.push({ id: t.id, message: e?.message || "failed" });
        }
      }
      return res.json({ ok: true, entity, lang, mode, created, updated, skipped, failures });
    }

    if (entity === "countries") {
      const rows = await prisma.country.findMany({ where: parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : undefined });
      const targets: Array<{ id: string; baseName: string }> = [];
      const existed = new Map<string, boolean>();
      for (const c of rows) {
        try {
          const existing = await prisma.countryI18n.findUnique({
            where: { countryId_lang: { countryId: c.id, lang: lang as any } },
          });
          if (existing && !force) {
            skipped++;
            continue;
          }
          existed.set(c.id, Boolean(existing));
          targets.push({ id: c.id, baseName: c.name });
        } catch (e: any) {
          failures.push({ id: c.id, message: e?.message || "failed" });
        }
      }
      let translatedNames: string[] = [];
      if (mode === "machine") {
        const names = targets.map((t) => t.baseName);
        const BATCH = 40;
        for (let i = 0; i < names.length; i += BATCH) {
          const chunk = names.slice(i, i + BATCH);
          const out = await deepseekTranslateStrings({ targetLang: lang, texts: chunk });
          translatedNames.push(...out);
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          let name = t.baseName;
          if (mode === "empty") name = "";
          else if (mode === "machine") name = translatedNames[i] || t.baseName;
          await prisma.countryI18n.upsert({
            where: { countryId_lang: { countryId: t.id, lang: lang as any } },
            update: { name },
            create: { countryId: t.id, lang: lang as any, name },
          });
          if (existed.get(t.id)) updated++;
          else created++;
        } catch (e: any) {
          failures.push({ id: t.id, message: e?.message || "failed" });
        }
      }
      return res.json({ ok: true, entity, lang, mode, created, updated, skipped, failures });
    }

    if (entity === "ports") {
      const rows = await prisma.port.findMany({ where: parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : undefined });
      const targets: Array<{ id: string; baseName: string }> = [];
      const existed = new Map<string, boolean>();
      for (const p of rows) {
        try {
          const existing = await prisma.portI18n.findUnique({
            where: { portId_lang: { portId: p.id, lang: lang as any } },
          });
          if (existing && !force) {
            skipped++;
            continue;
          }
          existed.set(p.id, Boolean(existing));
          targets.push({ id: p.id, baseName: p.name });
        } catch (e: any) {
          failures.push({ id: p.id, message: e?.message || "failed" });
        }
      }
      let translatedNames: string[] = [];
      if (mode === "machine") {
        const names = targets.map((t) => t.baseName);
        const BATCH = 40;
        for (let i = 0; i < names.length; i += BATCH) {
          const chunk = names.slice(i, i + BATCH);
          const out = await deepseekTranslateStrings({ targetLang: lang, texts: chunk });
          translatedNames.push(...out);
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
          let name = t.baseName;
          if (mode === "empty") name = "";
          else if (mode === "machine") name = translatedNames[i] || t.baseName;
          await prisma.portI18n.upsert({
            where: { portId_lang: { portId: t.id, lang: lang as any } },
            update: { name },
            create: { portId: t.id, lang: lang as any, name },
          });
          if (existed.get(t.id)) updated++;
          else created++;
        } catch (e: any) {
          failures.push({ id: t.id, message: e?.message || "failed" });
        }
      }
      return res.json({ ok: true, entity, lang, mode, created, updated, skipped, failures });
    }

    return res.status(400).json({ message: "entity 不支持" });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "批量失败", created, updated, skipped, failures });
  }
});

app.get("/api/public/products", async (req, res) => {
  const { lang, fallback } = resolveLang(req);
  const rows = await prisma.product.findMany({
    where: { enabled: true },
    include: {
      i18n: { where: { lang: { in: [lang as any, fallback as any] } } },
      category: { include: { i18n: { where: { lang: { in: [lang as any, fallback as any] } } } } },
      subcategory: { include: { i18n: { where: { lang: { in: [lang as any, fallback as any] } } } } },
      images: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const out = rows.map((p) => {
    const loc = pickLocalized((p as any).i18n, lang, fallback);
    const catLoc = pickLocalized((p as any).category?.i18n, lang, fallback);
    const subLoc = pickLocalized((p as any).subcategory?.i18n, lang, fallback);
    return {
      ...p,
      name: (loc as any)?.name ?? p.name,
      description: (loc as any)?.description ?? p.description,
      specs: (loc as any)?.specs ?? p.specs,
      category: p.category
        ? {
            ...p.category,
            name: (catLoc as any)?.name ?? (p.category as any).name,
          }
        : null,
      subcategory: p.subcategory
        ? {
            ...p.subcategory,
            name: (subLoc as any)?.name ?? (p.subcategory as any).name,
          }
        : null,
    };
  });
  res.json(out);
});

app.post("/api/public/quote", async (req, res) => {
  const parsed = quoteItemsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  try {
    const { lang, fallback } = resolveLang(req);
    const q = await computePricingForItems(parsed.data.portId, parsed.data.items, { lang, fallback });
    res.json({
      itemsTotalUsd: q.itemsTotalUsd,
      totalCbm: q.totalCbm,
      billableCbm: q.billableCbm,
      freightUsd: q.freightUsd,
      fixedFees: q.fixedFees,
      fixedFeesTotalUsd: q.fixedFeesTotalUsd,
      totalUsd: q.totalUsd,
      lineItems: q.lineItems.map(({ productName, ...rest }) => ({ ...rest, productName })),
    });
  } catch (e: any) {
    res.status(400).json({ message: e?.message || "报价失败" });
  }
});
app.get("/api/admin/products", auth, async (_req, res) => {
  const rows = await prisma.product.findMany({ include: { category: true, subcategory: true, images: true } });
  res.json(rows);
});
app.get("/api/admin/products/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  const row = await prisma.productI18n.findUnique({ where: { productId_lang: { productId: id, lang: lang as any } } });
  res.json(row ? { lang: row.lang, name: row.name, description: row.description, specs: row.specs } : null);
});
app.put("/api/admin/products/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  if (lang === DEFAULT_LANG) return res.status(400).json({ message: "默认语言请直接编辑产品本体字段" });
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional().default(""),
    specs: z.any().optional().default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  const row = await prisma.productI18n.upsert({
    where: { productId_lang: { productId: id, lang: lang as any } },
    update: { name: parsed.data.name, description: parsed.data.description, specs: parsed.data.specs },
    create: { productId: id, lang: lang as any, name: parsed.data.name, description: parsed.data.description, specs: parsed.data.specs },
  });
  res.json({ ok: true, lang: row.lang });
});
app.post("/api/admin/products", auth, async (req, res) => {
  const row = await prisma.product.create({ data: req.body });
  res.json(row);
});
app.put("/api/admin/products/:id", auth, async (req, res) => {
  const row = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
  res.json(row);
});
app.delete("/api/admin/products/:id", auth, async (req, res) => {
  await prisma.product.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/admin/categories", auth, async (_req, res) => {
  const rows = await prisma.category.findMany({ include: { subcats: true }, orderBy: { sortOrder: "asc" } });
  res.json(rows);
});
app.get("/api/admin/categories/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  const row = await prisma.categoryI18n.findUnique({ where: { categoryId_lang: { categoryId: id, lang: lang as any } } });
  res.json(row ? { lang: row.lang, name: row.name } : null);
});
app.put("/api/admin/categories/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  if (lang === DEFAULT_LANG) return res.status(400).json({ message: "默认语言请直接编辑分类本体字段" });
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  await prisma.categoryI18n.upsert({
    where: { categoryId_lang: { categoryId: id, lang: lang as any } },
    update: { name: parsed.data.name },
    create: { categoryId: id, lang: lang as any, name: parsed.data.name },
  });
  res.json({ ok: true });
});
app.post("/api/admin/categories", auth, async (req, res) => {
  const row = await prisma.category.create({ data: req.body });
  res.json(row);
});
app.put("/api/admin/categories/:id", auth, async (req, res) => {
  const row = await prisma.category.update({ where: { id: req.params.id }, data: req.body });
  res.json(row);
});
app.delete("/api/admin/categories/:id", auth, async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
app.post("/api/admin/subcategories", auth, async (req, res) => {
  const row = await prisma.subcategory.create({ data: req.body });
  res.json(row);
});
app.get("/api/admin/subcategories/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  const row = await prisma.subcategoryI18n.findUnique({
    where: { subcategoryId_lang: { subcategoryId: id, lang: lang as any } },
  });
  res.json(row ? { lang: row.lang, name: row.name } : null);
});
app.put("/api/admin/subcategories/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  if (lang === DEFAULT_LANG) return res.status(400).json({ message: "默认语言请直接编辑子分类本体字段" });
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  await prisma.subcategoryI18n.upsert({
    where: { subcategoryId_lang: { subcategoryId: id, lang: lang as any } },
    update: { name: parsed.data.name },
    create: { subcategoryId: id, lang: lang as any, name: parsed.data.name },
  });
  res.json({ ok: true });
});
app.put("/api/admin/subcategories/:id", auth, async (req, res) => {
  const row = await prisma.subcategory.update({ where: { id: req.params.id }, data: req.body });
  res.json(row);
});
app.delete("/api/admin/subcategories/:id", auth, async (req, res) => {
  await prisma.subcategory.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.get("/api/public/countries", async (req, res) => {
  const { lang, fallback } = resolveLang(req);
  const rows = await prisma.country.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
    include: { i18n: { where: { lang: { in: [lang as any, fallback as any] } } } },
  });
  res.json(
    rows.map((c) => {
      const loc = pickLocalized((c as any).i18n, lang, fallback);
      return { ...c, name: (loc as any)?.name ?? c.name };
    }),
  );
});
app.get("/api/public/ports", async (req, res) => {
  const { lang, fallback } = resolveLang(req);
  const countryId = String(req.query.countryId || "");
  const rows = await prisma.port.findMany({
    where: { countryId, enabled: true },
    include: { pricing: true, i18n: { where: { lang: { in: [lang as any, fallback as any] } } } },
  });
  res.json(
    rows.map((p) => {
      const loc = pickLocalized((p as any).i18n, lang, fallback);
      return { ...p, name: (loc as any)?.name ?? p.name };
    }),
  );
});
app.get("/api/admin/ports", auth, async (_req, res) => {
  const rows = await prisma.port.findMany({ include: { country: true, pricing: true } });
  res.json(rows);
});
app.post("/api/admin/countries", auth, async (req, res) => res.json(await prisma.country.create({ data: req.body })));
app.put("/api/admin/countries/:id", auth, async (req, res) => res.json(await prisma.country.update({ where: { id: req.params.id }, data: req.body })));
app.delete("/api/admin/countries/:id", auth, async (req, res) => res.json(await prisma.country.delete({ where: { id: req.params.id } })));
app.post("/api/admin/ports", auth, async (req, res) => res.json(await prisma.port.create({ data: req.body })));
app.put("/api/admin/ports/:id", auth, async (req, res) => res.json(await prisma.port.update({ where: { id: req.params.id }, data: req.body })));
app.delete("/api/admin/ports/:id", auth, async (req, res) => res.json(await prisma.port.delete({ where: { id: req.params.id } })));

app.get("/api/admin/countries/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  const row = await prisma.countryI18n.findUnique({ where: { countryId_lang: { countryId: id, lang: lang as any } } });
  res.json(row ? { lang: row.lang, name: row.name } : null);
});
app.put("/api/admin/countries/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  if (lang === DEFAULT_LANG) return res.status(400).json({ message: "默认语言请直接编辑国家本体字段" });
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  await prisma.countryI18n.upsert({
    where: { countryId_lang: { countryId: id, lang: lang as any } },
    update: { name: parsed.data.name },
    create: { countryId: id, lang: lang as any, name: parsed.data.name },
  });
  res.json({ ok: true });
});

app.get("/api/admin/ports/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  const row = await prisma.portI18n.findUnique({ where: { portId_lang: { portId: id, lang: lang as any } } });
  res.json(row ? { lang: row.lang, name: row.name } : null);
});
app.put("/api/admin/ports/:id/i18n", auth, async (req, res) => {
  const id = req.params.id;
  const lang = String(req.query.lang || "").trim().toLowerCase();
  if (!(SUPPORTED_LANGS as readonly string[]).includes(lang)) return res.status(400).json({ message: "lang 参数错误" });
  if (lang === DEFAULT_LANG) return res.status(400).json({ message: "默认语言请直接编辑港口本体字段" });
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  await prisma.portI18n.upsert({
    where: { portId_lang: { portId: id, lang: lang as any } },
    update: { name: parsed.data.name },
    create: { portId: id, lang: lang as any, name: parsed.data.name },
  });
  res.json({ ok: true });
});

app.get("/api/admin/pricing-rules", auth, async (_req, res) => {
  const rows = await prisma.pricingRule.findMany({ include: { port: { include: { country: true } } } });
  res.json(rows);
});
app.put("/api/admin/pricing-rules/:portId", auth, async (req, res) => {
  const portId = req.params.portId;
  const data = req.body;
  const row = await prisma.pricingRule.upsert({
    where: { portId },
    update: data,
    create: { ...data, portId },
  });
  res.json(row);
});

app.post("/api/public/orders", async (req, res) => {
  const schema = z.object({
    portId: z.string().optional().nullable(),
    procurementMethod: z.string().min(1),
    contactEmail: z.string().email(),
    contactSocial: z.string().min(1),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(z.object({ productId: z.string(), qty: z.number().int().positive() })).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误", errors: parsed.error.flatten() });
  const payload = parsed.data;

  try {
    const pricing = await computePricingForItems(payload.portId, payload.items);
    const lineItems = pricing.lineItems.map(({ productName: _n, ...rest }) => rest);

    const created = await prisma.order.create({
      data: {
        portId: payload.portId || null,
        procurementMethod: payload.procurementMethod,
        contactEmail: payload.contactEmail,
        contactSocial: payload.contactSocial,
        contactName: payload.contactName || null,
        contactPhone: payload.contactPhone || null,
        notes: payload.notes || "",
        ip: req.ip,
        currency: "USD",
        totalCbm: pricing.totalCbm,
        freightUsd: pricing.freightUsd,
        fixedFees: pricing.fixedFees,
        totalUsd: pricing.totalUsd,
        items: { create: lineItems },
      },
      include: { items: true },
    });
    res.json(created);
  } catch (e: any) {
    res.status(400).json({ message: e?.message || "下单失败" });
  }
});

app.get("/api/admin/orders", auth, async (_req, res) => {
  const rows = await prisma.order.findMany({
    include: { items: { include: { product: true } }, port: { include: { country: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

app.post("/api/public/ai/chat", async (req, res) => {
  const schema = z.object({
    conversationId: z.string().optional(),
    message: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "参数错误" });
  const { conversationId, message } = parsed.data;

  function detectUserMessageLang(text: string): Lang | null {
    const s = String(text || "");
    const lower = s.toLowerCase();

    // Arabic
    if (/[\u0600-\u06FF]/.test(s)) return "ar";
    // Chinese (CJK Unified Ideographs + common CJK punctuation)
    if (/[\u4E00-\u9FFF\u3000-\u303F]/.test(s)) return "zh";
    // Russian (Cyrillic)
    if (/[\u0400-\u04FF]/.test(s)) return "ru";
    // Korean (Hangul)
    if (/[\uAC00-\uD7AF]/.test(s)) return "ko";
    // Thai
    if (/[\u0E00-\u0E7F]/.test(s)) return "th";

    // Vietnamese (common diacritics)
    if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(s)) return "vi";

    // French (accents + some stopwords)
    if (/[àâçéèêëîïôùûüÿœæ]/i.test(s) || /\b(je|tu|vous|nous|bonjour|merci|besoin|catalogue|projet|devis)\b/i.test(lower)) {
      return "fr";
    }

    // Spanish (inverted punctuation + some stopwords)
    if (/[¡¿]/.test(s) || /\b(hola|gracias|necesito|catálogo|proyecto|cotización)\b/i.test(lower)) return "es";

    // Portuguese (diacritics + some stopwords)
    if (/[ãõçáàâéêíóôú]/i.test(s) || /\b(olá|obrigado|preciso|catálogo|projeto|cotação)\b/i.test(lower)) return "pt";

    // Malay (common stopwords)
    if (/\b(saya|anda|untuk|dengan|dalam|produk|bahan|harga|projek|katalog|sebut\s*harga)\b/i.test(lower)) return "ms";

    // Swahili (common stopwords)
    if (/\b(mimi|wewe|kwa|na|bidhaa|bei|mradi|katalogi|tafadhali|habari|asante)\b/i.test(lower)) return "sw";

    // 纯拉丁字母无accent时无法可靠判断语种：返回 null，由界面语言（query lang）决定回复语言
    return null;
  }

  const fallbackReqLang = resolveLang(req).lang;
  const userMsgLang = detectUserMessageLang(message) ?? fallbackReqLang;
  const outputLangLabelByLang: Record<Lang, string> = {
    zh: "Chinese (Simplified)",
    en: "English",
    fr: "French",
    es: "Spanish",
    pt: "Portuguese",
    ru: "Russian",
    ko: "Korean",
    ms: "Malay",
    th: "Thai",
    vi: "Vietnamese",
    ar: "Arabic",
    sw: "Swahili",
  };
  const outputLangLabel = outputLangLabelByLang[userMsgLang] || "English";

  const conversation = conversationId
    ? await prisma.aiConversation.findUnique({ where: { id: conversationId } })
    : await prisma.aiConversation.create({ data: { ip: req.ip, summary: message.slice(0, 80) } });

  if (!conversation) return res.status(404).json({ message: "会话不存在" });

  await prisma.aiMessage.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });

  const MAX_AI_HISTORY_MESSAGES = 36;
  const historyRows = await prisma.aiMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const historySlice =
    historyRows.length > MAX_AI_HISTORY_MESSAGES
      ? historyRows.slice(-MAX_AI_HISTORY_MESSAGES)
      : historyRows;
  const historyForApi = historySlice
    .filter((m) => m.role === "user" || m.role === "ai")
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const products = await prisma.product.findMany({
    where: { enabled: true },
    take: 200,
    include: { category: true, subcategory: true },
  });
  const matchedProducts = findMentionedProducts(message, products);

  const catalogLines = products.map((p) => {
    const cat = p.category?.name || "";
    const sub = p.subcategory?.name ? ` / ${p.subcategory.name}` : "";
    const price = Number(p.priceUsd).toFixed(2);
    const desc = (p.description || "").replace(/\s+/g, " ").slice(0, 120);
    return `- [${p.name}] ${cat}${sub} · USD ${price}${desc ? ` · ${desc}` : ""}`;
  });
  const PRODUCT_CATALOG_TEXT = catalogLines.join("\n").slice(0, 12000);

  function fallbackReply(lang: Lang, userText: string): string {
    const t = String(userText || "").trim();
    if (lang === "zh") {
      const lower = t.toLowerCase();
      const isGreeting = /^(你好|您好|hi|hello|hey)\b/.test(t) || /\b(hi|hello|hey)\b/.test(lower);
      if (isGreeting) {
        return "你好～我是青泰销售顾问。你想要哪类材料（轻钢龙骨/石膏板/吊顶铝材等）？另外项目在什么国家/城市？我好按场景给你推荐。";
      }
      const excerpt = t.length > 60 ? `${t.slice(0, 60)}…` : t;
      return `收到：${excerpt}\n\n为了更快给你报价/算量，发我 3 个信息：\n1）需要的材料类型\n2）面积/长度×宽度（或图纸）\n3）交付国家/港口（如有）`;
    }
    if (lang === "en") {
      return "Got it. Tell me the material type + your dimensions/area + destination country/port, and I’ll estimate quantities and help you order.";
    }
    // Other languages: keep concise and non-repetitive by echoing the request topic lightly.
    const excerpt = t.length > 48 ? `${t.slice(0, 48)}…` : t;
    return `${excerpt ? `Noted: ${excerpt}\n\n` : ""}Tell me the product type, dimensions/area, and destination, and I’ll help with quantities and ordering.`;
  }

  let aiContent = fallbackReply(userMsgLang, message);
  let deepseekOk = false;
  const toolProductIds = new Set<string>();
  let deepseekErr: string | null = null;

  async function runAiTool(name: string, rawArgs: string): Promise<string> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }
    if (name === "search_products") {
      const kw = String(args.keyword || "").trim();
      if (!kw) return JSON.stringify({ products: [] });
      const hits = await prisma.product.findMany({
        where: { enabled: true, name: { contains: kw, mode: "insensitive" } },
        take: 12,
        include: { category: true, subcategory: true },
      });
      for (const p of hits) toolProductIds.add(p.id);
      return JSON.stringify({
        products: hits.map((p) => ({
          id: p.id,
          name: p.name,
          priceUsd: Number(p.priceUsd),
          category: p.category?.name,
        })),
      });
    }
    if (name === "compute_cbm") {
      const lengthCm = Number(args.lengthCm);
      const widthCm = Number(args.widthCm);
      const heightCm = Number(args.heightCm);
      const qty = Math.max(1, Math.floor(Number(args.qty) || 1));
      if (!lengthCm || !widthCm || !heightCm) {
        return JSON.stringify({ error: "Please provide length, width, and height (cm)" });
      }
      const unitCbm = (lengthCm * widthCm * heightCm) / 1_000_000;
      return JSON.stringify({ unitCbm, qty, totalCbm: unitCbm * qty, unit: "m³" });
    }
    return JSON.stringify({ error: "Unknown tool" });
  }

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const cardBlock =
        matchedProducts.length > 0
          ? userMsgLang === "zh"
            ? `\n\n【产品卡片（必须遵守）】\n系统已从用户话里命中以下产品，前端会展示对应产品卡片。你必须先用一两句话明确引导用户「先看下方产品卡片」了解规格与价格，再回答其余问题；不要假装用户看不到卡片。\n命中产品：${matchedProducts.map((p) => p.name).join("、")}\n`
            : `\n\n[Product Cards (MUST follow)]\nThe system matched the following products from the user's message. The frontend will display product cards. You MUST first guide the user to "check the product cards below" for specs and pricing, then answer other questions. Do not pretend the user cannot see the cards.\nMatched products: ${matchedProducts.map((p) => p.name).join(", ")}\n`
          : "";

      const systemPrompt = userMsgLang === "zh"
        ? "【角色与风格】\n"
          + "你是青泰建材专业销售。话不能太多，言简意赅，表达核心。风格：幽默、风趣、温暖。\n\n"
          + "【语言规则（最高优先级，必须遵守）】\n"
          + "你必须始终使用「用户最后一条消息」所使用的语言来回复。\n"
          + "用户用英文你就用英文，用户用中文你就用中文，用户用阿拉伯语你就用阿拉伯语。\n"
          + "若用户最后一条消息无法判断语种（例如只有纯拉丁字母且无明确特征），则使用界面语言回复，当前界面语言为："
          + outputLangLabel
          + "。\n"
          + "如果用户混用语言，以最后一条消息中能明确识别的语种为准。\n"
          + "除非用户明确要求翻译成某种语言，否则不要输出双语。\n\n"
          + "【职责范围】\n"
          + "你只做三件事：①介绍产品 ②计算用量 ③辅助下单。一切以订单成交为导向。\n\n"
          + "【工具】\n"
          + "需要按名称找产品时调用 search_products；需要按长宽高（厘米）算体积时调用 compute_cbm。\n\n"
          + "【产品目录】\n"
          + "你能参照下方「当前产品目录」中的每一款产品。客户提到具体产品时，须引导其查看界面中的产品卡片。\n\n"
          + "【计算与资料】\n"
          + "用量计算须遵循下方「计算资料」中的规则与公式；资料未写明的不要编造，可说明缺什么尺寸/参数并引导补充或下单。\n"
          + cardBlock
          + "\n【当前产品目录】\n"
          + (PRODUCT_CATALOG_TEXT || "（暂无上架产品）")
          + (AI_KNOWLEDGE_TEXT ? `\n\n【计算资料】\n${AI_KNOWLEDGE_TEXT}` : "")
        : "[Role & Style]\n"
          + "You are a professional Qingtai Materials sales assistant. Be concise and to the point. Style: friendly, warm, with a touch of humor.\n\n"
          + "[Language Rules (HIGHEST PRIORITY)]\n"
          + "You MUST always reply in the language of the user's latest message.\n"
          + "If the user's latest message language cannot be determined (e.g. only plain Latin letters with no distinguishing features), use the interface language: "
          + outputLangLabel
          + ".\n"
          + "If the user mixes languages, follow the last clearly identifiable language.\n"
          + "Do NOT output bilingual text unless the user explicitly requests translation.\n\n"
          + "[Responsibilities]\n"
          + "You do three things: 1) Introduce products 2) Calculate quantities 3) Assist with ordering. Everything is oriented toward closing the deal.\n\n"
          + "[Tools]\n"
          + "Call search_products to find products by name; call compute_cbm to calculate volume from dimensions (cm).\n\n"
          + "[Product Catalog]\n"
          + "You can refer to every product in the Current Product Catalog below. When the customer mentions a specific product, guide them to view the product card in the interface.\n\n"
          + "[Calculation & Reference]\n"
          + "Quantity calculations must follow the rules and formulas in the Calculation Reference below. Do not fabricate anything not stated; explain what dimensions/parameters are missing and guide the user to supplement or place an order.\n"
          + cardBlock
          + "\n[Current Product Catalog]\n"
          + (PRODUCT_CATALOG_TEXT || "(No products listed yet)")
          + (AI_KNOWLEDGE_TEXT ? `\n\n[Calculation Reference]\n${AI_KNOWLEDGE_TEXT}` : "");

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "search_products",
            description: "Search products by keyword (fuzzy match)",
            parameters: {
              type: "object",
              properties: { keyword: { type: "string", description: "Search keyword, e.g. gypsum board, steel frame" } },
              required: ["keyword"],
            },
          },
        },
        {
          type: "function" as const,
          function: {
            name: "compute_cbm",
            description: "Calculate unit volume (m³) from length/width/height in cm, optional quantity for total volume",
            parameters: {
              type: "object",
              properties: {
                lengthCm: { type: "number" },
                widthCm: { type: "number" },
                heightCm: { type: "number" },
                qty: { type: "number", description: "Quantity, default 1" },
              },
              required: ["lengthCm", "widthCm", "heightCm"],
            },
          },
        },
      ];

      const hardLangSystem = [
        "OUTPUT_LANGUAGE (HIGHEST PRIORITY):",
        `The user's latest message language is ${outputLangLabel}.`,
        `You MUST reply in ${outputLangLabel} ONLY.`,
        "Do NOT include any other language (no bilingual output).",
      ].join("\n");

      const messages: any[] = [
        { role: "system", content: systemPrompt },
        { role: "system", content: hardLangSystem },
        ...historyForApi,
      ];

      for (let round = 0; round < 4; round++) {
        const r = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages,
            tools,
            tool_choice: "auto",
          }),
        });
        const data = (await r.json()) as any;
        const assistantMsg = data?.choices?.[0]?.message;
        if (!assistantMsg) break;

        const tcs = assistantMsg.tool_calls;
        if (Array.isArray(tcs) && tcs.length > 0) {
          messages.push(assistantMsg);
          for (const tc of tcs) {
            const fn = tc?.function;
            const name = fn?.name as string;
            const argsStr = (fn?.arguments as string) || "{}";
            const out = await runAiTool(name, argsStr);
            messages.push({ role: "tool", tool_call_id: tc.id, content: out });
          }
          continue;
        }

        const next = assistantMsg.content;
        if (typeof next === "string" && next.trim()) {
          aiContent = next.trim();
          deepseekOk = true;
        }
        break;
      }
    } catch (e: any) {
      deepseekErr = e?.message || String(e || "deepseek_failed");
      console.error("[ai] deepseek call failed:", deepseekErr);
    }
  }

  const toolProducts = products.filter((p) => toolProductIds.has(p.id));
  const mergedMap = new Map<string, (typeof products)[0]>();
  for (const p of matchedProducts) mergedMap.set(p.id, p);
  for (const p of toolProducts) mergedMap.set(p.id, p);
  const responseProducts = [...mergedMap.values()];
  const matched = responseProducts[0];

  if (!deepseekOk && responseProducts.length > 0) {
    const names = responseProducts.map((p) => p.name).join("、");
    aiContent = `已为您匹配：${names}。请先查看下方产品卡片了解规格与价格，需要再一键加购。`;
  }
  if (!deepseekOk && responseProducts.length === 0 && deepseekErr) {
    // Keep user experience smooth: provide actionable fallback without exposing internal stack traces.
    aiContent = fallbackReply(userMsgLang, message);
  }

  const aiMessage = await prisma.aiMessage.create({
    data: {
      conversationId: conversation.id,
      role: "ai",
      content: aiContent,
      productId: matched?.id || null,
    },
  });

  res.json({
    conversationId: conversation.id,
    message: aiMessage,
    product: matched || null,
    products: responseProducts,
  });
});

app.get("/api/admin/ai-status", auth, async (_req, res) => {
  res.json({
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    knowledgeDir: AI_KNOWLEDGE_DIR,
    knowledgeFiles: AI_KNOWLEDGE_DOCS.map((d) => d.file),
    knowledgeLoadedCount: AI_KNOWLEDGE_DOCS.length,
    knowledgeChars: AI_KNOWLEDGE_TEXT.length,
  });
});

app.get("/api/admin/ai-conversations", auth, async (_req, res) => {
  const rows = await prisma.aiConversation.findMany({
    include: { messages: { orderBy: { createdAt: "asc" }, include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

function uploadUrl(req: express.Request, filePath: string) {
  return `${req.protocol}://${req.get("host")}/uploads/${path.basename(filePath)}`;
}

app.post("/api/admin/upload", auth, (req, res) => {
  imageUpload.single("file")(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ message: err instanceof Error ? err.message : "上传失败" });
    if (!req.file) return res.status(400).json({ message: "未上传文件" });
    res.json({ url: uploadUrl(req, req.file.path) });
  });
});

app.post("/api/admin/upload-video", auth, (req, res) => {
  videoUpload.single("file")(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ message: err instanceof Error ? err.message : "上传失败" });
    if (!req.file) return res.status(400).json({ message: "未上传文件" });
    res.json({ url: uploadUrl(req, req.file.path) });
  });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: err?.message || "服务端错误" });
});

if (!fs.existsSync(path.resolve("uploads"))) fs.mkdirSync(path.resolve("uploads"), { recursive: true });
app.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`));

