-- 访客日志独立 schema：与 public schema 完全隔离
-- 在宝塔 PostgreSQL 终端执行：psql -U Jinyi -d jinyi -f visitor_log.sql
-- 或直接复制粘贴到查询窗口

CREATE SCHEMA IF NOT EXISTS visitor_log;

-- 会话表：同一访客 30 分钟内的所有请求归并为一个 session
CREATE TABLE IF NOT EXISTS visitor_log.sessions (
  id           BIGSERIAL PRIMARY KEY,
  ip_prefix    TEXT NOT NULL,            -- 截尾 IP，如 "123.123.123.0"
  ua_hash      TEXT NOT NULL,            -- UA 的 SHA1，用于归并而不存原文
  ua_raw       TEXT,                     -- 原始 UA（用于后台展示浏览器/系统）
  country      TEXT,                     -- GeoIP 解析（可空，未配 mmdb 时不填）
  city         TEXT,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,  -- last_seen - first_seen
  entry_path   TEXT,                     -- 首个请求的 path
  referer      TEXT                      -- 首个请求的 referer
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON visitor_log.sessions(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_first_seen ON visitor_log.sessions(first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_lookup ON visitor_log.sessions(ip_prefix, ua_hash, last_seen DESC);

-- 事件表：每个进站请求一行
CREATE TABLE IF NOT EXISTS visitor_log.events (
  id           BIGSERIAL PRIMARY KEY,
  session_id   BIGINT NOT NULL REFERENCES visitor_log.sessions(id) ON DELETE CASCADE,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  status       INTEGER,
  duration_ms  INTEGER,
  referer      TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_session ON visitor_log.events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_ts ON visitor_log.events(ts DESC);

-- 90 天清理函数（手动调用 / cron 调用）
CREATE OR REPLACE FUNCTION visitor_log.cleanup_old(days INTEGER DEFAULT 90)
RETURNS TABLE(deleted_sessions BIGINT, deleted_events BIGINT) AS $$
DECLARE
  ev_count BIGINT;
  se_count BIGINT;
BEGIN
  DELETE FROM visitor_log.events WHERE ts < NOW() - (days || ' days')::interval;
  GET DIAGNOSTICS ev_count = ROW_COUNT;
  DELETE FROM visitor_log.sessions WHERE last_seen < NOW() - (days || ' days')::interval;
  GET DIAGNOSTICS se_count = ROW_COUNT;
  RETURN QUERY SELECT se_count, ev_count;
END;
$$ LANGUAGE plpgsql;

-- 验证：查看是否建好
SELECT 'visitor_log schema ready' AS status;
