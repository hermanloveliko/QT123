const env = import.meta.env as any;
// 生产环境默认走同源（/api），避免 https→http / 端口不通导致 Failed to fetch
export const API_BASE = env?.VITE_API_BASE ?? (env?.DEV ? "http://localhost:8787" : "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.message || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

