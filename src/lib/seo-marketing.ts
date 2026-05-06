/**
 * Google SEO / 投流落地页：readme 中英文静态页 TDK、路径解析与文档 meta 同步。
 * 仅在 locale 为英文时写入 readme 中的 Title / Description / Keywords。
 */

import type { Product } from "./api";

export type MarketingSlug =
  | "aluminum-ceiling"
  | "acoustic-panels"
  | "building-boards"
  | "ceiling-accessories";

export const MARKETING_SLUGS: MarketingSlug[] = [
  "aluminum-ceiling",
  "acoustic-panels",
  "building-boards",
  "ceiling-accessories",
];

export function isMarketingSlug(s: string): s is MarketingSlug {
  return (MARKETING_SLUGS as readonly string[]).includes(s);
}

/** 目录侧边栏「全部」与其它筛选共用前缀 */
export const CATALOG_ALL_KEY = "__all__";

export type MarketingStaticSeoKey =
  | "home"
  | "products"
  | "aluminum-ceiling"
  | "acoustic-panels"
  | "building-boards"
  | "ceiling-accessories"
  | "about-us"
  | "contact"
  | "faq";

export type ParsedMarketingRoute =
  | { kind: "home" }
  | { kind: "catalog"; slug?: MarketingSlug }
  | { kind: "detail"; productId: string }
  | { kind: "about" }
  | { kind: "contact" }
  | { kind: "faq" }
  | { kind: "cart" }
  | { kind: "projects" }
  | { kind: "admin" };

/** readme 文档静态英文 TDK */
export const SEO_EN_STATIC: Record<
  MarketingStaticSeoKey,
  { title: string; description: string; keywords: string }
> = {
  home: {
    title: "Aluminum Ceiling & Acoustic Panel Manufacturer | QingTai Building Materials",
    description:
      "China-based aluminum ceiling tiles, perforated acoustic panels, calcium silicate boards & full range of suspended ceiling systems. Factory direct with custom sizes & colors. Get a quote now.",
    keywords:
      "aluminum ceiling manufacturer, acoustic panel supplier, calcium silicate board factory, perforated metal ceiling, suspended ceiling system China, building materials wholesale",
  },
  products: {
    title: "All Building Materials Products | Ceiling, Acoustic & Partition Systems",
    description:
      "Browse our complete product range: aluminum louvers, ceiling tiles, perforated acoustic boards (calcium silicate, cement, gypsum), and full accessories. One-stop sourcing for your project.",
    keywords:
      "building materials product catalog, ceiling and partition materials, acoustic panels, aluminum ceiling tiles, perforated board, factory direct products",
  },
  "aluminum-ceiling": {
    title: "Aluminum Ceiling Tiles & Louvers Manufacturer | Custom Colors & Sizes",
    description:
      "Factory supply of aluminum ceiling tiles, aluminum louvers (U-shaped), and aluminum flat panels. Powder-coated or wood grain finish. Ideal for airport, mall, office. Fast sample.",
    keywords:
      "aluminum ceiling tiles, aluminum louver ceiling, aluminum square tube, suspended aluminum ceiling, custom aluminum ceiling China, metal ceiling panels",
  },
  "acoustic-panels": {
    title: "Perforated Acoustic Panels | Calcium Silicate, Cement, Gypsum Boards",
    description:
      "High NRC perforated acoustic panels made from calcium silicate, fiber cement, or gypsum. Also composite acoustic boards. Reduce echo in offices, theaters, schools. OEM hole patterns.",
    keywords:
      "perforated acoustic panels, calcium silicate acoustic board, fiber cement acoustic panel, perforated gypsum board, acoustic ceiling tiles, sound absorbing panels factory",
  },
  "building-boards": {
    title: "Calcium Silicate & Fiber Cement Boards | Fireproof & Moisture Resistant",
    description:
      "Durable calcium silicate boards, fiber cement boards, and gypsum boards for ceiling, partition, and wall lining. Cut-to-size & custom perforation available. Factory price.",
    keywords:
      "calcium silicate board, fiber cement board, gypsum board, cement board for ceiling, partition board, building board manufacturer",
  },
  "ceiling-accessories": {
    title: "Ceiling Accessories & Suspension Systems | T-Grid, Hangers, Edge Trim",
    description:
      "Complete ceiling accessories including T-grid, main tees, cross tees, wire hangers, perimeter trim, and all clips. Compatible with aluminum, mineral fiber, or gypsum boards.",
    keywords:
      "ceiling T-grid, suspended ceiling accessories, ceiling hangers, drywall trim, aluminium profile for ceiling, ceiling mounting system",
  },
  "about-us": {
    title: "About QingTai – Aluminum & Acoustic Building Materials Factory in China",
    description:
      "QingTai Building Materials is a direct factory based in Shanghai area, specializing in aluminum ceilings, perforated acoustic boards, and related systems. 10+ years export experience. Quality guarantee & custom service.",
    keywords:
      "building materials factory China, aluminum ceiling manufacturer, acoustic panel factory, QingTai company, Shanghai building materials supplier",
  },
  contact: {
    title: "Contact QingTai Building Materials | Get a Quote for Ceiling & Acoustic Products",
    description:
      "Reach our sales team for customized aluminum ceilings, acoustic panels, or boards. Request a catalog, sample, or factory-direct price. Fast reply within 24 hours.",
    keywords:
      "contact building materials supplier, request quote aluminum ceiling, acoustic panel inquiry, QingTai contact, building materials factory email",
  },
  faq: {
    title: "FAQ – Custom Ceiling & Acoustic Panels | Factory Direct Answers",
    description:
      "Frequently asked questions about MOQ, lead time, custom perforation, shipping, payment terms, and samples. Everything you need to know before ordering from QingTai.",
    keywords:
      "building materials FAQ, ceiling tile MOQ, acoustic panel lead time, custom perforation China, factory sample policy, QingTai help",
  },
};

function normalizePathname(pathname: string): string {
  let p = pathname || "/";
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** 解析前台路由（不含 /admin，交给入口单独处理） */
export function parseMarketingPath(pathname: string): ParsedMarketingRoute {
  const raw = normalizePathname(pathname);
  if (raw === "/" || raw === "") return { kind: "home" };

  const segments = raw.slice(1).split("/").filter(Boolean);

  if (segments[0] === "products" && segments[1] === "item" && segments[2]) {
    return { kind: "detail", productId: decodeURIComponent(segments[2]) };
  }
  if (segments[0] === "products") return { kind: "catalog" };

  if (segments.length === 1 && isMarketingSlug(segments[0])) {
    return { kind: "catalog", slug: segments[0] };
  }

  if (raw === "/about-us" || raw === "/about") return { kind: "about" };
  if (raw === "/contact") return { kind: "contact" };
  if (raw === "/faq") return { kind: "faq" };
  if (raw === "/cart") return { kind: "cart" };
  if (raw === "/projects") return { kind: "projects" };

  return { kind: "home" };
}

/** 根据前台视图生成规范 pathname（含末尾 `/` 的保持一致便于 readme 对齐） */
export function buildMarketingPath(
  kind:
    | "home"
    | "catalog"
    | "detail"
    | "about"
    | "contact"
    | "faq"
    | "cart"
    | "projects",
  opts?: { catalogSlug?: MarketingSlug | null; productId?: string | null },
): string {
  switch (kind) {
    case "home":
      return "/";
    case "catalog": {
      const slug = opts?.catalogSlug;
      if (slug && isMarketingSlug(slug)) return `/${slug}/`;
      return "/products/";
    }
    case "detail": {
      const id = String(opts?.productId || "").trim();
      return id ? `/products/item/${encodeURIComponent(id)}` : "/products/";
    }
    case "about":
      return "/about-us/";
    case "contact":
      return "/contact/";
    case "faq":
      return "/faq/";
    case "cart":
      return "/cart";
    case "projects":
      return "/projects";
    default:
      return "/";
  }
}

/** 品类落地 slug → 与侧边栏分类 label 模糊匹配（英文或中文后台命名均可尝试命中） */
export function matchCategoryKeyForMarketingSlug(
  slug: MarketingSlug,
  categories: Array<{ key: string; label: string }>,
): string | undefined {
  const patterns: Record<MarketingSlug, (label: string) => boolean> = {
    "aluminum-ceiling": (label) => /aluminum|铝/i.test(label),
    "acoustic-panels": (label) => /acoustic|sound|吸音|隔音/i.test(label),
    "building-boards": (label) => /gypsum|board|石膏|硅酸|水泥|calcium|silicate|cement/i.test(label),
    "ceiling-accessories": (label) => /steel|fastener|tool|龙骨|紧固|配件|framing/i.test(label),
  };
  const pred = patterns[slug];
  for (const c of categories) {
    if (!c.key || c.key === CATALOG_ALL_KEY) continue;
    if (pred(c.label)) return c.key;
  }
  return undefined;
}

function truncateChars(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

const CJK_RE = /[\u3400-\u9fff]/u;

function hasCjk(s: string) {
  return CJK_RE.test(String(s || ""));
}

function englishFallback(input: string, fallback: string, max = 80) {
  const raw = String(input || "").trim();
  if (!raw) return truncateChars(fallback, max);
  // For English SEO snippets, avoid injecting full Chinese phrases into title/description.
  if (hasCjk(raw)) return truncateChars(fallback, max);
  return truncateChars(raw, max);
}

function inferApplication(product: Product) {
  const text = `${product.name} ${product.category} ${(product.specs || []).join(" ")}`.toLowerCase();
  if (/acoustic|sound|noise|吸音|隔音/.test(text)) return "offices, theaters, schools";
  if (/ceiling|吊顶|天花|铝/.test(text)) return "airports, malls, office buildings";
  if (/board|cement|gypsum|silicate|水泥|石膏|硅酸/.test(text)) return "ceiling, partition, and wall lining";
  return "commercial and public building projects";
}

/** readme 第四节：产品详情英文模板（仅在 lang=en 时写入 meta） */
export function buildProductSeoEn(product: Product): {
  title: string;
  description: string;
  keywords: string;
} {
  const typeKw =
    /acoustic|吸音|隔音/i.test(product.category || product.name)
      ? "perforated acoustic panel"
      : /aluminum|铝/i.test(product.category || product.name)
        ? "ceiling tile"
        : "building materials";

  const name = englishFallback(product.name, "Custom Building Material Panel", 70);
  const material = englishFallback(product.category, "building materials", 40);
  const sizeSpec = product.specs?.find(Boolean);
  const size = englishFallback(sizeSpec || "", "custom size", 35);
  const feat = englishFallback(
    product.specs?.slice(0, 2).filter(Boolean).join("; ") || "",
    "factory quality",
    70,
  );
  const application = inferApplication(product);

  const title = truncateChars(
    `${name}_Products_QINGTAI GROUP CO., LTD.`,
    80,
  );

  const description = truncateChars(
    `${name} – factory direct from China. Material: ${material}. Size: ${size}. Feature: ${feat}. Ideal for ${application}. Get sample or bulk price.`,
    160,
  );

  const keywords = [
    englishFallback(product.name.split(/\s+/).slice(0, 4).join(" "), typeKw, 40),
    `${material} board`,
    typeKw,
    "custom building materials",
    "QingTai acoustic",
    "building material supplier China",
  ]
    .filter(Boolean)
    .join(", ");

  return { title, description, keywords };
}

function upsertMetaName(name: string, content: string) {
  let el = document.querySelector(`meta[name="${CSS.escape(name)}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertHrefAlternate(hreflang: string, href: string) {
  let el = document.querySelector(
    `link[rel="alternate"][hreflang="${hreflang.replace(/"/g, '\\"')}"]`,
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "alternate");
    el.setAttribute("hreflang", hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function removeExistingHreflang() {
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((n) => n.remove());
}

/** readme：hreflang；英文页与中文版 query lang=zh */
export function updateHreflangTags(origin: string, pathname: string, searchParams: URLSearchParams) {
  removeExistingHreflang();
  const basePath = pathname || "/";
  const enQs = new URLSearchParams(searchParams);
  enQs.set("lang", "en");
  const zhQs = new URLSearchParams(searchParams);
  zhQs.set("lang", "zh");

  const enHref = `${origin}${basePath}${enQs.toString() ? `?${enQs.toString()}` : ""}`;
  const zhHref = `${origin}${basePath}${zhQs.toString() ? `?${zhQs.toString()}` : ""}`;

  upsertHrefAlternate("en", enHref);
  upsertHrefAlternate("zh-CN", zhHref);
  upsertHrefAlternate("x-default", enHref);
}

/** Canonical：便于广告投放落地 URL 唯一 */
export function updateCanonical(origin: string, pathname: string, search: string) {
  const path = pathname || "/";
  const href = `${origin}${path}${search || ""}`;
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function applyMarketingDocumentSeo(opts: {
  lang: string;
  /** 静态落地页 key 或产品详情 */
  staticKey?: MarketingStaticSeoKey | "product";
  product?: Product | null;
}) {
  if (opts.staticKey === "product" && opts.product && opts.product.id !== "__loading__") {
    const p = buildProductSeoEn(opts.product);
    document.title = p.title;
    upsertMetaName("description", p.description);
    upsertMetaName("keywords", p.keywords);
    return;
  }

  if (opts.staticKey && opts.staticKey !== "product") {
    const seo = SEO_EN_STATIC[opts.staticKey];
    if (seo) {
      document.title = seo.title;
      upsertMetaName("description", seo.description);
      upsertMetaName("keywords", seo.keywords);
    }
  }
}

export function resolveStaticSeoKey(opts: {
  page:
    | "home"
    | "catalog"
    | "detail"
    | "about"
    | "contact"
    | "faq"
    | "cart"
    | "projects"
    | "projectDetail"
    | "systemDetail"
    | "admin";
  catalogSlug?: MarketingSlug | null;
}): MarketingStaticSeoKey | "product" | null {
  const { page, catalogSlug } = opts;
  if (page === "detail") return "product";
  if (page === "catalog") {
    if (catalogSlug && isMarketingSlug(catalogSlug)) return catalogSlug;
    return "products";
  }
  if (page === "home") return "home";
  if (page === "about") return "about-us";
  if (page === "contact") return "contact";
  if (page === "faq") return "faq";
  return null;
}
