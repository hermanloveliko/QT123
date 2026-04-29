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
// Behind Nginx / a load balancer, req.protocol is otherwise "http" and generated asset URLs become mixed content on HTTPS sites.
app.set("trust proxy", 1);
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
/** 生产环境建议设置：对外访问站点的根 URL（无尾斜杠）。上传返回的图片地址将固定用此域名+协议，不依赖反代头。例：https://www.example.com */
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
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

const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF]/u;
// Arabic script + its common presentation forms / digits (avoid mis-targeting CJK for ar)
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const A2Z_RE = /[A-Za-z]/g;

function hasCJK(s: string) {
  return CJK_RE.test(s);
}
function hasArabic(s: string) {
  return ARABIC_RE.test(s);
}
function asciiLetterRatio(s: string) {
  const raw = String(s || "");
  if (!raw) return 0;
  const m = raw.match(A2Z_RE);
  return m ? m.length / raw.length : 0;
}
function looksLikeEnglishProse(s: string) {
  // Heuristic: many ASCII letters in a long string → likely English content for non-English target locales
  if (s.length < 8) return false;
  return asciiLetterRatio(s) > 0.2;
}
function looksLikeLongEnglishWithoutArabic(s: string) {
  if (s.length < 8) return false;
  if (hasArabic(s)) return false;
  return asciiLetterRatio(s) > 0.2;
}
function isBadI18nForTargetLang(lang: Lang, out: string, base: string) {
  const o = String(out || "");
  const b = String(base || "");
  if (lang === "vi") {
    // Vietnamese target should not keep Chinese; if any CJK left, re-run with stricter rule.
    if (hasCJK(o)) return true;
    // If the base is Chinese and output still looks like English, try again
    if (hasCJK(b) && !hasCJK(o) && looksLikeEnglishProse(o) && o.length > 6) return true;
  }
  if (lang === "ar") {
    // Arabic page should be Arabic script for human-readable strings; CJK/English left means fix needed.
    if (hasCJK(o)) return true;
    if (looksLikeLongEnglishWithoutArabic(o)) return true;
  }
  if (lang === "sw") {
    if (hasCJK(o)) return true;
  }
  return false;
}

/** Second pass: stricter target-language output when first pass still looks like wrong language. */
async function deepseekTranslateStringsStrict(
  targetLang: Lang,
  texts: string[],
  extraSystemRule: string,
): Promise<string[]> {
  if (texts.length === 0) return [];
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY 未配置，无法机器翻译");
  }
  const systemPrompt =
    "You are a professional translation engine for the building materials / construction industry.\n"
    + "Translate each input string into the TARGET LANGUAGE, keeping the original array order.\n"
    + "Your output MUST be a strict JSON array of strings. Output ONLY the array, no extra text.\n\n"
    + "你是建筑材料/工程领域的专业翻译引擎。\n"
    + "把输入的字符串逐条翻译成【目标语言】，保持原数组顺序。\n"
    + "输出必须是严格 JSON 字符串数组（只输出数组，不要解释，不要 Markdown）。\n\n"
    + `TARGET LANGUAGE / 目标语言：${targetLang}\n`
    + `STRICT OVERRIDES / 强约束：\n${extraSystemRule}\n`
    + "Style / 风格：清晰、专业、适合产品目录与报价沟通；不要夸张营销。\n"
    + "Glossary / 术语偏好（按语境选择最自然表达）：\n"
    + "- 轻钢龙骨: light steel keel / steel framing\n"
    + "- 石膏板: gypsum board\n"
    + "- 水泥板: cement board\n"
    + "- 吊顶: ceiling system\n"
    + "- 隔墙: partition wall\n"
    + "Rules / 要求：\n"
    + "- Preserve numbers, units, model names (e.g. M4), currency symbols\n"
    + "- Preserve punctuation like EXW/FOB/CIF/DDP and keep it uppercase\n";

  const userPrompt = JSON.stringify({ texts }, null, 0);

  const callWithRetry = async (fn: () => Promise<string>): Promise<string> => {
    let lastErr: any = null;
    const tries = Number(process.env.DEEPSEEK_RETRY_TIMES || 2);
    for (let i = 0; i <= tries; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || "");
        const isTimeout = msg.includes("超时") || msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
        const isFormat = msg.includes("不是 JSON") || msg.includes("条数不一致");
        if (i >= tries || (!isTimeout && !isFormat)) throw e;
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    throw lastErr ?? new Error("机器翻译失败");
  };

  const callOnce = async (extra: string) => {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 15000);
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000);
    try {
      const r = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt + "\n" + extra + "\n" },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
        }),
      });
      const data = (await r.json()) as any;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("机器翻译失败：无返回内容");
      return content;
    } catch (e: any) {
      if (String(e?.name || "").toLowerCase().includes("abort")) {
        throw new Error("机器翻译超时（DeepSeek 不可达或响应过慢）");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
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

  const first = await callWithRetry(() => callOnce(""));
  try {
    return tryParseArray(first);
  } catch {
    const second = await callWithRetry(() => callOnce("STRICT: Output ONLY a JSON array of strings, no other characters."));
    return tryParseArray(second);
  }
}

function strictBackstopRuleForLang(lang: Lang): string {
  if (lang === "vi") {
    return "强制：输出为越南语（Tiếng Việt），不得出现中文/日文/韩文（不得含任何 CJK 字符）。\n"
      + "如原文为中文，必须完整意译为越南语，不要保留中文字样或中英夹杂的长英语句子。\n"
      + "可保留：数字、mm、m、单位符号、产品型号/牌号、货币与贸易术语（EXW/FOB/CIF/USD 等）。";
  }
  if (lang === "ar") {
    return "强制：输出为标准阿拉伯语（用阿拉伯文书写），不得把整段说明留在英文；不得出现中文/日文/韩文。\n"
      + "若原文是英文/中文/混合语言，应统一改写为通顺的阿拉伯语说明。\n"
      + "可保留：数字、mm、m、单位、型号/牌号、货币与贸易术语（EXW/FOB/CIF/USD 等）。";
  }
  if (lang === "sw") {
    return "强制：输出为斯瓦希里语（Kiswahili），不得出现中文/日文/韩文（不得含 CJK 字符）。";
  }
  return "强制：输出仅使用目标语言，不得出现与目标语言明显不符的大段源语言。";
}

/** 按原文批量做「二遍严译」并写入缓存；供前台与后台共用。 */
async function buildStrictI18nFixMap(lang: Lang, bases: Iterable<string>) {
  const out = new Map<string, string>();
  if (lang === DEFAULT_LANG) return out;
  if (!process.env.DEEPSEEK_API_KEY) return out;
  const cache = ((
    (globalThis as any).__qt_i18n_strict = (globalThis as any).__qt_i18n_strict
    || new Map<string, string>()
  )) as Map<string, string>;
  const rule = strictBackstopRuleForLang(lang);
  const need: string[] = [];
  for (const raw of bases) {
    const b = String(raw ?? "").trim();
    if (!b) continue;
    const k = `${lang}::${b}`;
    if (cache.has(k)) {
      out.set(b, cache.get(k)!);
      continue;
    }
    need.push(b);
  }
  if (!need.length) return out;
  const max = Number(process.env.PUBLIC_STRICT_FIX_MAX || 100);
  const list = (Number.isFinite(max) && max > 0 ? need.slice(0, max) : need) as string[];
  const BATCH = 24;
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    let fixed = await deepseekTranslateStringsStrict(lang, chunk, rule);
    for (let j = 0; j < chunk.length; j++) {
      const b = chunk[j];
      let v = fixed[j] ?? b;
      if (isBadI18nForTargetLang(lang, v, b)) {
        try {
          const one = await deepseekTranslateStringsStrict(lang, [b], rule);
          v = one[0] ?? v;
        } catch {
          // use first pass
        }
      }
      const k = `${lang}::${b}`;
      if (!isBadI18nForTargetLang(lang, v, b)) {
        cache.set(k, v);
      } else {
        cache.delete(k);
      }
      out.set(b, v);
    }
  }
  return out;
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
    "You are a professional translation engine for the building materials / construction industry.\n"
    + "Translate each input string into the TARGET LANGUAGE, keeping the original array order.\n"
    + "Your output MUST be a strict JSON array of strings. Output ONLY the array, no extra text.\n\n"
    + "你是建筑材料/工程领域的专业翻译引擎。\n"
    + "把输入的字符串逐条翻译成【目标语言】，保持原数组顺序。\n"
    + "输出必须是严格 JSON 字符串数组（只输出数组，不要解释，不要 Markdown）。\n\n"
    + `TARGET LANGUAGE / 目标语言：${targetLang}\n`
    + "Style / 风格：清晰、专业、适合产品目录与报价沟通；不要夸张营销。\n"
    + "Glossary / 术语偏好（按语境选择最自然表达）：\n"
    + "- 轻钢龙骨: light steel keel / steel framing\n"
    + "- 石膏板: gypsum board\n"
    + "- 水泥板: cement board\n"
    + "- 吊顶: ceiling system\n"
    + "- 隔墙: partition wall\n"
    + "Rules / 要求：\n"
    + "- Preserve numbers, units, model names (e.g. M4), currency symbols\n"
    + "- Preserve punctuation like EXW/FOB/CIF/DDP and keep it uppercase\n"
    + "- 强制翻译：除模型/单位/数字/货币/贸易术语外，任何包含源语言文字的内容都必须翻译成目标语言，不要原样返回源语言（避免中英夹杂/不翻译的短语）。\n";

  const userPrompt = JSON.stringify({ texts }, null, 0);

  const callWithRetry = async (fn: () => Promise<string>): Promise<string> => {
    let lastErr: any = null;
    const tries = Number(process.env.DEEPSEEK_RETRY_TIMES || 2);
    for (let i = 0; i <= tries; i++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || "");
        const isTimeout = msg.includes("超时") || msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
        const isFormat = msg.includes("不是 JSON") || msg.includes("条数不一致");
        if (i >= tries || (!isTimeout && !isFormat)) throw e;
        // backoff
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    throw lastErr ?? new Error("机器翻译失败");
  };

  const callOnce = async (extraRule?: string) => {
    const controller = new AbortController();
    // Admin batch may translate longer texts; default longer timeout.
    const timeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 15000);
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 12000);
    try {
      const r = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        signal: controller.signal,
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
    } catch (e: any) {
      if (String(e?.name || "").toLowerCase().includes("abort")) {
        throw new Error("机器翻译超时（DeepSeek 不可达或响应过慢）");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
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
  const first = await callWithRetry(() => callOnce());
  try {
    return tryParseArray(first);
  } catch {
    // 若返回格式不规范，重试一次；若 DeepSeek 不可达/超时，上层会捕获并回退
    const second = await callWithRetry(() =>
      callOnce("STRICT: Output ONLY a JSON array of strings, no other characters."),
    );
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
  if (opts.targetLang !== DEFAULT_LANG) {
    const bad: string[] = [];
    for (const s of uniq) {
      const t = mapping.get(s);
      if (t && isBadI18nForTargetLang(opts.targetLang, t, s)) bad.push(s);
    }
    if (bad.length) {
      const fix = await buildStrictI18nFixMap(opts.targetLang, bad);
      for (const s of bad) {
        const v = fix.get(s);
        if (v != null) mapping.set(s, v);
      }
    }
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

function prismaWriteConflictMessage(e: any): string | null {
  if (e?.code !== "P2002") return null;
  const meta = e?.meta;
  const fields = meta?.target ?? meta?.constraint?.fields;
  if (Array.isArray(fields) && fields.length) return `数据冲突：字段 ${fields.join(", ")} 已存在，请修改后重试`;
  return "数据冲突：与已有记录重复，请修改后重试";
}

async function runAdminWrite<T>(res: express.Response, action: () => Promise<T>, fallbackMsg: string) {
  try {
    const out = await action();
    return out;
  } catch (e: any) {
    const conflict = prismaWriteConflictMessage(e);
    if (conflict) {
      res.status(409).json({ message: conflict });
      return null;
    }
    res.status(500).json({ message: e?.message || fallbackMsg });
    return null;
  }
}

/** 只保留 Product 可写的标量字段，避免把 list 接口里的 category / images 等一起 POST 进 Prisma 导致写入失败。 */
function pickProductWriteData(body: any): Record<string, unknown> {
  const allowed = new Set([
    "name",
    "categoryId",
    "subcategoryId",
    "priceUsd",
    "enabled",
    "imageCoverUrl",
    "specs",
    "description",
    "lengthCm",
    "widthCm",
    "heightCm",
    "cbmPerUnit",
  ]);
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(body || {})) {
    if (allowed.has(k)) o[k] = body[k];
  }
  return o;
}

function computeCbm(p: { cbmPerUnit: any; lengthCm: number | null; widthCm: number | null; heightCm: number | null }) {
  if (p.cbmPerUnit != null) return Number(p.cbmPerUnit);
  if (p.lengthCm && p.widthCm && p.heightCm) return (p.lengthCm * p.widthCm * p.heightCm) / 1000000;
  return 0;
}

const PUBLIC_SITE_SETTING_KEYS = [
  "contact",
  "home.hero",
  "home.consultation",
  "home.bulletin",
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

  const nameBasesToFix = new Set<string>();
  for (const it of items) {
    const p = pm.get(it.productId) as any;
    if (!p) throw new Error(`产品不存在: ${it.productId}`);
    const loc = pickLocalized((p as any).i18n, lang, fallback);
    const baseN = String(p.name || "");
    const outN = (loc as any)?.name;
    if (outN != null && String(outN).trim() !== "" && isBadI18nForTargetLang(lang, String(outN), baseN) && baseN.trim()) {
      nameBasesToFix.add(baseN.trim());
    } else if (!outN || String(outN).trim() === "") {
      if (baseN.trim() && isBadI18nForTargetLang(lang, baseN, baseN)) nameBasesToFix.add(baseN.trim());
    }
  }
  const nameFix = await buildStrictI18nFixMap(lang, nameBasesToFix);

  for (const it of items) {
    const p = pm.get(it.productId) as any;
    if (!p) throw new Error(`产品不存在: ${it.productId}`);
    const loc = pickLocalized((p as any).i18n, lang, fallback);
    const baseN = String(p.name || "");
    const outN = (loc as any)?.name;
    const productName = (() => {
      if (outN != null && String(outN).trim() !== "") {
        const raw = String(outN);
        return isBadI18nForTargetLang(lang, raw, baseN) && baseN.trim()
          ? (nameFix.get(baseN.trim()) ?? raw)
          : raw;
      }
      if (baseN.trim() && isBadI18nForTargetLang(lang, baseN, baseN)) {
        return nameFix.get(baseN.trim()) ?? p.name;
      }
      return p.name;
    })();
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
      productName,
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

app.get("/api/public/categories", async (req, res) => {
  const { lang, fallback } = resolveLang(req);
  const rows = await prisma.category.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
    include: { i18n: { where: { lang: { in: [lang as any, fallback as any] } } } },
  });
  const shouldAutoMt =
    lang !== DEFAULT_LANG
    && Boolean(process.env.DEEPSEEK_API_KEY)
    && String(req.query.autoMt || req.query.mt || "").trim() === "1";

  const mtCache = (globalThis as any).__qt_public_mt_cache as Map<string, string> | undefined;
  const cache: Map<string, string> =
    mtCache ?? ((globalThis as any).__qt_public_mt_cache = new Map<string, string>());

  let mtMap: Map<string, string> | null = null;
  if (shouldAutoMt) {
    try {
      const texts: string[] = [];
      for (const c of rows) {
        const loc = pickLocalized((c as any).i18n, lang, fallback);
        if ((loc as any)?.name) continue;
        const base = String((c as any).name || "").trim();
        if (base) texts.push(base);
      }
      const uniq = Array.from(new Set(texts));
      const need: string[] = [];
      for (const s of uniq) if (!cache.has(`${lang}::${s}`)) need.push(s);
      if (need.length) {
        const BATCH = 40;
        for (let i = 0; i < need.length; i += BATCH) {
          const chunk = need.slice(i, i + BATCH);
          const out = await deepseekTranslateStrings({ targetLang: lang, texts: chunk });
          for (let j = 0; j < chunk.length; j++) cache.set(`${lang}::${chunk[j]}`, out[j]);
        }
      }
      mtMap = new Map<string, string>();
      for (const s of uniq) {
        const v = cache.get(`${lang}::${s}`);
        if (v != null) mtMap.set(s, v);
      }
    } catch {
      mtMap = null;
    }
  }

  const mt = (s: unknown) => {
    const raw = String(s || "").trim();
    if (!raw || !mtMap) return undefined;
    return mtMap.get(raw) ?? undefined;
  };
  res.json(
    rows.map((c) => {
      const loc = pickLocalized((c as any).i18n, lang, fallback);
      return {
        id: c.id,
        name: (loc as any)?.name ?? mt(c.name) ?? c.name,
        sortOrder: c.sortOrder,
      };
    }),
  );
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
    mode: z.enum(["empty", "copyZh", "machine", "machineOverwrite"]),
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
  const overwrite = mode === "machineOverwrite";
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
          if (existing && !force && !overwrite) {
            skipped++;
            continue;
          }
          const baseValue = row.value as any;
          let nextValue: unknown = baseValue;
          if (mode === "empty") nextValue = blankStringsDeep(baseValue);
          else if (mode === "copyZh") nextValue = baseValue;
          else if (mode === "machine" || overwrite) nextValue = await translateJsonValue({ targetLang: lang, value: baseValue });

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
          if (existing && !force && !overwrite) {
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
          } else if (mode === "machine" || overwrite) {
            const baseName = String(p.name || "");
            const baseDesc = String(p.description || "");
            const baseSpecs = Array.isArray(p.specs) ? (p.specs as any[]).map(String) : [];

            const headTexts = [baseName, baseDesc].filter((x) => String(x || "").trim() !== "");
            if (headTexts.length) {
              const headOut = await deepseekTranslateStrings({ targetLang: lang, texts: headTexts });
              let hi = 0;
              if (baseName.trim()) name = headOut[hi++] || baseName;
              if (baseDesc.trim()) description = headOut[hi++] || "";
            }

            const outSpecs: string[] = baseSpecs.map((b) => (String(b).trim() === "" ? "" : String(b)));
            const SPBATCH = 18;
            for (let i = 0; i < baseSpecs.length; i += SPBATCH) {
              const slice = baseSpecs.slice(i, i + SPBATCH);
              const chunk: string[] = [];
              const idxs: number[] = [];
              for (let j = 0; j < slice.length; j++) {
                const raw = String(slice[j] || "");
                if (!raw.trim()) continue;
                idxs.push(i + j);
                chunk.push(raw);
              }
              if (!chunk.length) continue;
              const out = await deepseekTranslateStrings({ targetLang: lang, texts: chunk });
              for (let k = 0; k < idxs.length; k++) outSpecs[idxs[k]] = out[k];
            }
            const strictBases: string[] = [];
            if (baseName.trim() && isBadI18nForTargetLang(lang, name, baseName)) strictBases.push(baseName.trim());
            if (baseDesc.trim() && isBadI18nForTargetLang(lang, description, baseDesc)) strictBases.push(baseDesc.trim());
            for (let i = 0; i < baseSpecs.length; i++) {
              const b = String(baseSpecs[i] || "");
              if (!b.trim()) continue;
              if (isBadI18nForTargetLang(lang, outSpecs[i], b)) strictBases.push(b.trim());
            }
            if (strictBases.length) {
              const fix = await buildStrictI18nFixMap(lang, strictBases);
              if (baseName.trim() && isBadI18nForTargetLang(lang, name, baseName)) {
                const v = fix.get(baseName.trim());
                if (v != null) name = v;
              }
              if (baseDesc.trim() && isBadI18nForTargetLang(lang, description, baseDesc)) {
                const v = fix.get(baseDesc.trim());
                if (v != null) description = v;
              }
              for (let i = 0; i < baseSpecs.length; i++) {
                const b = String(baseSpecs[i] || "");
                if (!b.trim()) continue;
                if (isBadI18nForTargetLang(lang, outSpecs[i], b)) {
                  const v = fix.get(b.trim());
                  if (v != null) outSpecs[i] = v;
                }
              }
            }
            specs = outSpecs;
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
          if (existing && !force && !overwrite) {
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
      if (mode === "machine" || overwrite) {
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
      if (mode === "machine" || overwrite) {
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

  const shouldAutoMt =
    lang !== DEFAULT_LANG
    && Boolean(process.env.DEEPSEEK_API_KEY)
    && String(req.query.autoMt || req.query.mt || "").trim() === "1";

  const mtCache = (globalThis as any).__qt_public_mt_cache as Map<string, string> | undefined;
  const cache: Map<string, string> =
    mtCache ?? ((globalThis as any).__qt_public_mt_cache = new Map<string, string>());

  const translateMissing = async (texts: string[]) => {
    const uniq = Array.from(new Set(texts.map((s) => String(s || "").trim()).filter(Boolean)));
    const need: string[] = [];
    for (const s of uniq) {
      const k = `${lang}::${s}`;
      if (!cache.has(k)) need.push(s);
    }
    if (need.length) {
      const BATCH = 40;
      for (let i = 0; i < need.length; i += BATCH) {
        const chunk = need.slice(i, i + BATCH);
        const out = await deepseekTranslateStrings({ targetLang: lang, texts: chunk });
        for (let j = 0; j < chunk.length; j++) cache.set(`${lang}::${chunk[j]}`, out[j]);
      }
    }
    const m = new Map<string, string>();
    for (const s of uniq) {
      const k = `${lang}::${s}`;
      const v = cache.get(k);
      if (v != null) m.set(s, v);
    }
    return m;
  };

  let mtMap: Map<string, string> | null = null;
  if (shouldAutoMt) {
    try {
      const collect: string[] = [];
      for (const p of rows) {
        const loc = pickLocalized((p as any).i18n, lang, fallback);
        if (!(loc as any)?.name) collect.push(String(p.name || ""));
        if (!(loc as any)?.description) collect.push(String(p.description || ""));
        if (!(loc as any)?.specs && Array.isArray((p as any).specs)) collect.push(...((p as any).specs as any[]).map(String));
        const catLoc = pickLocalized((p as any).category?.i18n, lang, fallback);
        if (p.category && !(catLoc as any)?.name) collect.push(String((p.category as any).name || ""));
        const subLoc = pickLocalized((p as any).subcategory?.i18n, lang, fallback);
        if (p.subcategory && !(subLoc as any)?.name) collect.push(String((p.subcategory as any).name || ""));
      }
      // 防止一次请求翻译过多导致阻塞：超过阈值直接跳过机翻
      const MAX_PUBLIC_MT_STRINGS = Number(process.env.PUBLIC_MT_MAX_STRINGS || 120);
      if (collect.length <= (Number.isFinite(MAX_PUBLIC_MT_STRINGS) ? MAX_PUBLIC_MT_STRINGS : 120)) {
        mtMap = await translateMissing(collect);
      } else {
        mtMap = null;
      }
    } catch (e: any) {
      // ignore MT failure; fall back to default fallback logic
      mtMap = null;
    }
  }

  let i18nStrictFix = new Map<string, string>();
  if (lang !== DEFAULT_LANG && !process.env.DEEPSEEK_API_KEY && !(globalThis as any).__qt_warned_no_deepseek) {
    (globalThis as any).__qt_warned_no_deepseek = true;
    console.warn("[api] DEEPSEEK_API_KEY 未配置：无法对错误 i18n 做机翻修正，请在 .env 配置后重启 API。");
  }
  if (lang !== DEFAULT_LANG && process.env.DEEPSEEK_API_KEY) {
    try {
      const needBases = new Set<string>();
      for (const p of rows) {
        const loc = pickLocalized((p as any).i18n, lang, fallback);
        const baseName = String((p as any).name || "");
        const baseDesc = String((p as any).description || "");
        if (loc) {
          if ((loc as any).name != null && String((loc as any).name).trim() !== ""
            && isBadI18nForTargetLang(lang, String((loc as any).name), baseName)) {
            if (baseName.trim()) needBases.add(baseName.trim());
          }
          if (String((loc as any).description || "").trim() !== ""
            && isBadI18nForTargetLang(lang, String((loc as any).description), baseDesc)) {
            if (baseDesc.trim()) needBases.add(baseDesc.trim());
          }
          const locSpecs = (loc as any).specs;
          const baseSpecs = (p as any).specs;
          if (Array.isArray(locSpecs) && Array.isArray(baseSpecs)) {
            const n = Math.min(locSpecs.length, baseSpecs.length);
            for (let i = 0; i < n; i++) {
              const b = String(baseSpecs[i] || "");
              const o = String(locSpecs[i] || "");
              if (o.trim() && isBadI18nForTargetLang(lang, o, b) && b.trim()) needBases.add(b.trim());
            }
          }
        } else {
          // 无 vi/ar 行且连 en 也没有：直接展示 Product 中文字段，需按目标语修
          if (baseName.trim() && isBadI18nForTargetLang(lang, baseName, baseName)) needBases.add(baseName.trim());
          if (baseDesc.trim() && isBadI18nForTargetLang(lang, baseDesc, baseDesc)) needBases.add(baseDesc.trim());
          if (Array.isArray((p as any).specs)) {
            for (const s of (p as any).specs as any[]) {
              const t = String(s || "").trim();
              if (t && isBadI18nForTargetLang(lang, t, t)) needBases.add(t);
            }
          }
        }
        const catLoc = pickLocalized((p as any).category?.i18n, lang, fallback);
        if (p.category && (catLoc as any)?.name) {
          const cb = String((p.category as any).name || "");
          const o = String((catLoc as any).name || "");
          if (o.trim() && isBadI18nForTargetLang(lang, o, cb) && cb.trim()) needBases.add(cb.trim());
        }
        const subLoc = pickLocalized((p as any).subcategory?.i18n, lang, fallback);
        if (p.subcategory && (subLoc as any)?.name) {
          const sb = String((p.subcategory as any).name || "");
          const o = String((subLoc as any).name || "");
          if (o.trim() && isBadI18nForTargetLang(lang, o, sb) && sb.trim()) needBases.add(sb.trim());
        }
      }
      i18nStrictFix = await buildStrictI18nFixMap(lang, needBases);
    } catch (e: any) {
      console.warn("[api] /api/public/products i18n strict fix:", e?.message || e);
      i18nStrictFix = new Map();
    }
  }

  const out = rows.map((p) => {
    const loc = pickLocalized((p as any).i18n, lang, fallback);
    const catLoc = pickLocalized((p as any).category?.i18n, lang, fallback);
    const subLoc = pickLocalized((p as any).subcategory?.i18n, lang, fallback);
    const mt = (s: unknown) => {
      const raw = String(s || "").trim();
      if (!raw || !mtMap) return undefined;
      return mtMap.get(raw) ?? undefined;
    };
    const baseName = String((p as any).name || "");
    const baseDesc = String((p as any).description || "");
    const nameLoc = (loc as any)?.name;
    const descLoc = (loc as any)?.description;
    let nameOut: string;
    if (nameLoc != null && String(nameLoc).trim() !== "") {
      const raw = String(nameLoc);
      nameOut = isBadI18nForTargetLang(lang, raw, baseName) && baseName.trim()
        ? (i18nStrictFix.get(baseName.trim()) ?? raw)
        : raw;
    } else {
      const fromBase = String(p.name || "");
      if (fromBase.trim() && isBadI18nForTargetLang(lang, fromBase, fromBase)) {
        nameOut = i18nStrictFix.get(fromBase.trim()) ?? fromBase;
      } else {
        nameOut = mt(p.name) ?? p.name;
      }
    }
    let descOut: string;
    if (descLoc != null && String(descLoc) !== "") {
      const raw = String(descLoc);
      descOut = isBadI18nForTargetLang(lang, raw, baseDesc) && baseDesc.trim()
        ? (i18nStrictFix.get(baseDesc.trim()) ?? raw)
        : raw;
    } else {
      const fromD = String(p.description || "");
      if (fromD.trim() && isBadI18nForTargetLang(lang, fromD, fromD)) {
        descOut = i18nStrictFix.get(fromD.trim()) ?? fromD;
      } else {
        descOut = (mt(p.description) ?? p.description) as string;
      }
    }
    let specsOut: any = p.specs;
    const locSpecs = (loc as any)?.specs;
    const baseSpecsA = (p as any).specs;
    if (Array.isArray(locSpecs) && locSpecs.length && Array.isArray(baseSpecsA)) {
      specsOut = locSpecs.map((line: any, i: number) => {
        const b = String(baseSpecsA[i] ?? "");
        const raw = String(line ?? "");
        if (raw.trim() && b.trim() && isBadI18nForTargetLang(lang, raw, b)) {
          return i18nStrictFix.get(b.trim()) ?? raw;
        }
        return raw;
      });
    } else if (Array.isArray(baseSpecsA) && baseSpecsA.length) {
      specsOut = baseSpecsA.map((line: any) => {
        const raw = String(line ?? "");
        if (raw.trim() && isBadI18nForTargetLang(lang, raw, raw)) {
          return i18nStrictFix.get(raw.trim()) ?? raw;
        }
        if (mtMap && raw.trim()) return mt(line) ?? raw;
        return raw;
      });
    } else if (mtMap && Array.isArray((p as any).specs)) {
      specsOut = (p as any).specs.map((x: any) => mt(x) ?? x);
    }
    return {
      ...p,
      name: nameOut,
      description: descOut,
      specs: specsOut,
      category: p.category
        ? {
            ...p.category,
            name: (() => {
              const cb = String((p.category as any).name || "");
              const raw = (catLoc as any)?.name;
              if (raw != null && String(raw).trim() !== "") {
                const t = String(raw);
                return isBadI18nForTargetLang(lang, t, cb) && cb.trim() ? (i18nStrictFix.get(cb.trim()) ?? t) : t;
              }
              return mt((p.category as any).name) ?? (p.category as any).name;
            })(),
          }
        : null,
      subcategory: p.subcategory
        ? {
            ...p.subcategory,
            name: (() => {
              const sb = String((p.subcategory as any).name || "");
              const raw = (subLoc as any)?.name;
              if (raw != null && String(raw).trim() !== "") {
                const t = String(raw);
                return isBadI18nForTargetLang(lang, t, sb) && sb.trim() ? (i18nStrictFix.get(sb.trim()) ?? t) : t;
              }
              return mt((p.subcategory as any).name) ?? (p.subcategory as any).name;
            })(),
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
  const row = await runAdminWrite(res, () => prisma.product.create({ data: req.body }), "创建产品失败");
  if (row) res.json(row);
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
  const row = await runAdminWrite(res, () => prisma.category.create({ data: req.body }), "创建分类失败");
  if (row) res.json(row);
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
  const row = await runAdminWrite(res, () => prisma.subcategory.create({ data: req.body }), "创建子分类失败");
  if (row) res.json(row);
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
app.post("/api/admin/countries", auth, async (req, res) => {
  const row = await runAdminWrite(res, () => prisma.country.create({ data: req.body }), "创建国家失败");
  if (row) res.json(row);
});
app.put("/api/admin/countries/:id", auth, async (req, res) => res.json(await prisma.country.update({ where: { id: req.params.id }, data: req.body })));
app.delete("/api/admin/countries/:id", auth, async (req, res) => res.json(await prisma.country.delete({ where: { id: req.params.id } })));
app.post("/api/admin/ports", auth, async (req, res) => {
  const row = await runAdminWrite(res, () => prisma.port.create({ data: req.body }), "创建港口失败");
  if (row) res.json(row);
});
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

  const takeCatalog = Math.min(500, Math.max(1, Number(process.env.AI_CHAT_MAX_PRODUCT_CARDS || 200)));
  const products = await prisma.product.findMany({
    where: { enabled: true },
    take: takeCatalog,
    orderBy: { updatedAt: "desc" },
    include: {
      category: true,
      subcategory: true,
      images: { orderBy: { sortOrder: "asc" } },
    },
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
        userMsgLang === "zh"
          ? `\n\n【产品卡片（必须遵守）】\n你发出本段文字后，聊天窗口里会在这条 AI 消息**正下方**展示**当前上架的全部产品**缩略图列表（可上下滚动，含主图/名称/快捷下单），不是发在“上面的历史里”。\n`
            + "当用户问「有没有图/图片/照片/实物/看看样子」时：请明确说「请在本条消息文字下方的产品列表里查看/滚动找」；**禁止**说「往聊天记录上翻」「之前发过你往上滑」「我上面发过图」等——那些都不存在。\n"
            + (matchedProducts.length
              ? `用户话里可能涉及：${matchedProducts.map((p) => p.name).join("、")}。可优先结合这些款回答，并仍提醒在下方大列表中可找到全部产品。\n`
              : "")
          : `\n\n[Product cards (MUST follow)]\nAfter your text, the UI shows a **scrollable list of ALL in-stock product cards directly BELOW this AI message** (not above in old chat). `
            + 'If the user asks for photos/images: tell them to **scroll the product list under this message**; do NOT say "scroll up in the chat" or "I already sent images earlier".\n'
            + (matchedProducts.length
              ? `The user may refer to: ${matchedProducts.map((p) => p.name).join(", ")}. You may highlight these, and remind that the full catalog is in the list below.\n`
              : "");

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

  const responseProducts = products;
  const matched = matchedProducts[0] || null;

  if (!deepseekOk && responseProducts.length > 0) {
    const n = responseProducts.length;
    aiContent =
      userMsgLang === "zh"
        ? `已加载本库 ${n} 款上架产品。请查看本条消息下方的产品卡片（可滚动），需要可一键加购。`
        : `Loaded ${n} in-stock products. Scroll the cards under this message for details, or add to cart.`;
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

function uploadUrl(_req: express.Request, filePath: string) {
  const name = path.basename(filePath);
  // 同源部署：优先相对路径，避免写入 DB 的绝对地址与页面 https 不一致被浏览器拦截。
  if (!PUBLIC_APP_URL) return `/uploads/${name}`;
  let base = PUBLIC_APP_URL.replace(/\/+$/, "");
  // 生产常见误配：PUBLIC_APP_URL 写成 http://，前台为 https 时会导致混链；本地 localhost 保持 http。
  if (/^http:\/\/(?!127\.0\.0\.1\b)(?!localhost\b)/i.test(base)) {
    base = `https://${base.slice("http://".length)}`;
  }
  return `${base}/uploads/${name}`;
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

