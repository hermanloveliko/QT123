export const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8787";

export const SUPPORTED_LANGS = [
  "zh",
  "en",
  "fr",
  "es",
  "pt",
  "ru",
  "ko",
  "ms",
  "th",
  "vi",
  "ar",
  "sw",
] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];

const LANG_STORAGE_KEY = "lang";

export function getLang(): Lang {
  const raw = localStorage.getItem(LANG_STORAGE_KEY) || "";
  return (SUPPORTED_LANGS as readonly string[]).includes(raw) ? (raw as Lang) : "zh";
}

export function setLang(lang: Lang) {
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  try {
    document.documentElement.lang = lang;
    // Basic RTL support for Arabic
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  } catch {
    // ignore
  }
}

export type AdminUser = { id: string; username: string };

export type ApiProduct = {
  id: string;
  name: string;
  priceUsd: string | number;
  enabled: boolean;
  imageCoverUrl?: string | null;
  specs: unknown;
  description: string;
  category?: { id: string; name: string } | null;
  subcategory?: { id: string; name: string } | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  cbmPerUnit?: string | number | null;
  images?: { url: string; sortOrder?: number }[];
};

export interface Product {
  id: string;
  name: string;
  /** 展示用（可能随语言变化） */
  category: string;
  /** 稳定筛选用（优先使用） */
  categoryId?: string | null;
  price: number;
  image: string;
  specs: string[];
  description: string;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  cbmPerUnit?: number | null;
  /** 详情页多图：首张与 image 一致 */
  gallery: string[];
}

export type Country = { id: string; name: string };
export type Port = { id: string; name: string; countryId: string };

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("admin_token");
  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const lang = getLang();
  if (!mergedHeaders["Accept-Language"]) {
    mergedHeaders["Accept-Language"] = lang;
  }
  if (token && !mergedHeaders.Authorization) {
    mergedHeaders.Authorization = `Bearer ${token}`;
  }

  const url = new URL(`${API_BASE}${path}`);
  if (!url.searchParams.get("lang")) url.searchParams.set("lang", lang);

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: mergedHeaders,
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

export function toLegacyProduct(p: ApiProduct): Product {
  const sorted = (p.images || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const urls = sorted.map((i) => i.url).filter(Boolean);
  const cover = p.imageCoverUrl || urls[0] || "https://picsum.photos/seed/material/800/600";
  const rest = p.imageCoverUrl ? urls : urls.slice(1);
  const gallery = [cover, ...rest.filter((u) => u !== cover)];
  return {
    id: p.id,
    name: p.name,
    category: p.category?.name || p.subcategory?.name || "未分类",
    categoryId: p.category?.id || p.subcategory?.id || null,
    price: Number(p.priceUsd) || 0,
    image: cover,
    specs: Array.isArray(p.specs) ? (p.specs as string[]) : [],
    description: p.description || "",
    lengthCm: p.lengthCm ?? null,
    widthCm: p.widthCm ?? null,
    heightCm: p.heightCm ?? null,
    cbmPerUnit: p.cbmPerUnit != null ? Number(p.cbmPerUnit) : null,
    gallery,
  };
}
