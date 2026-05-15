/**
 * 访客日志中间件 + 只读 admin 路由
 *
 * 设计目标：对现有业务零影响
 *  - 独立 pg.Pool（小连接池），不抢 Prisma 资源
 *  - 写入完全异步（setImmediate），不阻塞响应
 *  - 任何错误都吞掉（console.error），绝不抛给业务路由
 *  - VISITOR_LOG_ENABLED=false 可一键关闭
 *  - 不依赖 prisma schema，仅靠 visitor_log.sql 建出来的两张表
 */
import express from "express";
import crypto from "crypto";
import { Pool } from "pg";

const ENABLED = String(process.env.VISITOR_LOG_ENABLED ?? "true").toLowerCase() !== "false";
const SESSION_GAP_MIN = Number(process.env.VISITOR_LOG_SESSION_GAP_MIN || 30);

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!ENABLED) return null;
  if (pool) return pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) return null;
  pool = new Pool({ connectionString: cs, max: 4, idleTimeoutMillis: 30000 });
  pool.on("error", (err) => console.error("[visitor-log] pool error:", err.message));
  return pool;
}

/** 截尾 IP：IPv4 末位归零；IPv6 抹后 64 位。失败返回 "0.0.0.0"。 */
function maskIp(raw: string | undefined): string {
  if (!raw) return "0.0.0.0";
  let ip = raw.split(",")[0].trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    return "0.0.0.0";
  }
  if (ip.includes(":")) {
    const segs = ip.split(":");
    return segs.slice(0, 4).join(":") + "::";
  }
  return "0.0.0.0";
}

function uaHash(ua: string): string {
  return crypto.createHash("sha1").update(ua).digest("hex").slice(0, 16);
}

/** 排除不需要记录的请求（健康检查、上传静态、admin 后台自身的 API） */
function shouldSkip(req: express.Request): boolean {
  const p = req.path || "";
  if (p === "/api/health") return true;
  if (p.startsWith("/uploads/")) return true;
  if (p.startsWith("/api/admin/visitor-log")) return true; // 后台读自己时不记
  return false;
}

export const visitorLogger: express.RequestHandler = (req, res, next) => {
  if (!ENABLED) return next();
  if (shouldSkip(req)) return next();

  const startedAt = Date.now();

  res.on("finish", () => {
    setImmediate(() => {
      writeEvent(req, res, Date.now() - startedAt).catch((err) => {
        console.error("[visitor-log] write failed:", err?.message || err);
      });
    });
  });

  next();
};

async function writeEvent(req: express.Request, res: express.Response, durationMs: number) {
  const p = getPool();
  if (!p) return;

  const ip = maskIp((req.headers["x-forwarded-for"] as string) || req.ip || req.socket.remoteAddress || "");
  const ua = String(req.headers["user-agent"] || "").slice(0, 500);
  const uah = uaHash(ua);
  const referer = String(req.headers["referer"] || "").slice(0, 500) || null;
  const path = (req.originalUrl || req.url || "").slice(0, 500);

  const client = await p.connect();
  try {
    // 找 30 分钟内活跃的 session；找不到就建新的
    const find = await client.query<{ id: string }>(
      `SELECT id FROM visitor_log.sessions
       WHERE ip_prefix = $1 AND ua_hash = $2
         AND last_seen > NOW() - ($3 || ' minutes')::interval
       ORDER BY last_seen DESC LIMIT 1`,
      [ip, uah, String(SESSION_GAP_MIN)],
    );

    let sessionId: string;
    if (find.rows.length > 0) {
      sessionId = find.rows[0].id;
      await client.query(
        `UPDATE visitor_log.sessions
         SET last_seen = NOW(),
             request_count = request_count + 1,
             duration_sec = EXTRACT(EPOCH FROM (NOW() - first_seen))::INTEGER
         WHERE id = $1`,
        [sessionId],
      );
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO visitor_log.sessions
           (ip_prefix, ua_hash, ua_raw, entry_path, referer, request_count)
         VALUES ($1, $2, $3, $4, $5, 1)
         RETURNING id`,
        [ip, uah, ua, path, referer],
      );
      sessionId = ins.rows[0].id;
    }

    await client.query(
      `INSERT INTO visitor_log.events (session_id, method, path, status, duration_ms, referer)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, req.method, path, res.statusCode, durationMs, referer],
    );
  } finally {
    client.release();
  }
}

/** 挂在已有 auth 中间件后面：const router = express.Router(); router.use(auth); router.use(visitorLogRoutes) */
export function mountVisitorLogRoutes(app: express.Express, auth: express.RequestHandler) {
  app.get("/api/admin/visitor-log/sessions", auth, async (req, res) => {
    try {
      const p = getPool();
      if (!p) return res.json({ items: [], total: 0, enabled: ENABLED });

      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const [items, total] = await Promise.all([
        p.query(
          `SELECT id, ip_prefix, ua_raw, country, city,
                  first_seen, last_seen, request_count, duration_sec,
                  entry_path, referer
           FROM visitor_log.sessions
           ORDER BY last_seen DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset],
        ),
        p.query(`SELECT COUNT(*)::bigint AS c FROM visitor_log.sessions`),
      ]);

      res.json({
        enabled: ENABLED,
        items: items.rows,
        total: Number(total.rows[0].c),
        limit,
        offset,
      });
    } catch (err: any) {
      console.error("[visitor-log] list sessions failed:", err?.message);
      res.status(500).json({ message: "查询失败", error: err?.message });
    }
  });

  app.get("/api/admin/visitor-log/sessions/:id/events", auth, async (req, res) => {
    try {
      const p = getPool();
      if (!p) return res.json({ items: [] });
      const id = String(req.params.id);
      if (!/^\d+$/.test(id)) return res.status(400).json({ message: "id 非法" });

      const ev = await p.query(
        `SELECT id, ts, method, path, status, duration_ms, referer
         FROM visitor_log.events
         WHERE session_id = $1
         ORDER BY ts ASC
         LIMIT 1000`,
        [id],
      );
      res.json({ items: ev.rows });
    } catch (err: any) {
      console.error("[visitor-log] list events failed:", err?.message);
      res.status(500).json({ message: "查询失败", error: err?.message });
    }
  });

  app.get("/api/admin/visitor-log/stats", auth, async (_req, res) => {
    try {
      const p = getPool();
      if (!p) return res.json({ enabled: ENABLED });
      const r = await p.query(
        `SELECT
           COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '24 hours')::bigint AS sessions_24h,
           COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '7 days')::bigint   AS sessions_7d,
           COUNT(*)::bigint AS sessions_total
         FROM visitor_log.sessions`,
      );
      const ev = await p.query(
        `SELECT COUNT(*)::bigint AS c FROM visitor_log.events
         WHERE ts > NOW() - INTERVAL '24 hours'`,
      );
      res.json({
        enabled: ENABLED,
        sessions_24h: Number(r.rows[0].sessions_24h),
        sessions_7d: Number(r.rows[0].sessions_7d),
        sessions_total: Number(r.rows[0].sessions_total),
        events_24h: Number(ev.rows[0].c),
      });
    } catch (err: any) {
      console.error("[visitor-log] stats failed:", err?.message);
      res.status(500).json({ message: "查询失败" });
    }
  });

  app.post("/api/admin/visitor-log/cleanup", auth, async (req, res) => {
    try {
      const p = getPool();
      if (!p) return res.status(503).json({ message: "未启用" });
      const days = Math.max(Number(req.body?.days) || 90, 1);
      const r = await p.query(`SELECT * FROM visitor_log.cleanup_old($1)`, [days]);
      res.json({ ok: true, ...r.rows[0] });
    } catch (err: any) {
      console.error("[visitor-log] cleanup failed:", err?.message);
      res.status(500).json({ message: "清理失败" });
    }
  });
}
