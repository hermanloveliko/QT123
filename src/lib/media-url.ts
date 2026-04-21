/** 用于比较的域名（忽略 www.，小写） */
function hostnameKey(host: string): string {
  return String(host || "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

/**
 * 规范化图片/视频 URL，避免 HTTPS 页面加载 HTTP 同源资源被浏览器拦截（混链）。
 * - 相对路径 `/uploads/...` 原样返回
 * - 与当前页面同站（含仅 www 差异）的 http:// 升级为 https://
 */
export function normalizeMediaUrl(raw: string): string {
  const u = String(raw || "").trim();
  if (!u) return u;
  if (u.startsWith("/")) return u;
  if (u.startsWith("//")) {
    try {
      if (typeof window !== "undefined" && window.location.protocol === "https:") {
        return `https:${u}`;
      }
    } catch {
      // ignore
    }
    return `https:${u}`;
  }
  if (typeof window === "undefined" || window.location.protocol !== "https:") return u;
  if (!u.startsWith("http://")) return u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:") return u;
    if (hostnameKey(parsed.hostname) !== hostnameKey(window.location.hostname)) return u;
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return u;
  }
}
