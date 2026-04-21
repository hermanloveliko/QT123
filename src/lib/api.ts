import { normalizeMediaUrl } from "./media-url";

function defaultApiBase(): string {
  // 未设置 VITE_API_BASE 时：用当前页面 origin，生产环境一般为同源 /api；
  // 开发环境由 Vite 把 /api、/uploads 代理到本机 8787（见 vite.config.ts）。
  // 若本机只跑前端、API 在远程服务器，必须在 .env 设置 VITE_API_BASE（无尾斜杠）。
  return "";
}

export const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? defaultApiBase();

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

  const base =
    API_BASE && String(API_BASE).trim() !== ""
      ? String(API_BASE)
      : typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
  const url = new URL(path, base);
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

function normalizeDisplayImageUrl(raw: string): string {
  return normalizeMediaUrl(String(raw || "").trim());
}

export function toLegacyProduct(p: ApiProduct): Product {
  const sorted = (p.images || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const urls = sorted.map((i) => i.url).filter(Boolean);
  const normUrls = urls.map(normalizeDisplayImageUrl);
  const coverPick = p.imageCoverUrl ? String(p.imageCoverUrl) : normUrls[0] || "https://picsum.photos/seed/material/800/600";
  const cover = normalizeDisplayImageUrl(coverPick);
  const rest = p.imageCoverUrl ? normUrls : normUrls.slice(1);
  const gallery = [cover, ...rest.filter((u) => u && u !== cover)];
  return {
    id: p.id,
    name: p.name,
    category: p.category?.name || p.subcategory?.name || "—",
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
