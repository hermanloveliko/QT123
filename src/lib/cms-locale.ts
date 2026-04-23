/**
 * 站点后台 CMS 文案以中文为主维护；非中文界面优先用 i18n，避免只回落到库里的中文。
 */

type SystemShape = { id: string; title: string; image: string; description: string; features: string[] };
type ProjectShape = { id: string; title: string; location: string; image: string; description: string };

export function isDefaultCmsLocale(lang: string | undefined): boolean {
  if (!lang) return true;
  const base = String(lang).split(/[-_]/)[0]!.toLowerCase();
  return base === "zh";
}

export function cmsText(
  lang: string | undefined,
  cms: unknown,
  t: (key: string) => string,
  i18nKey: string,
): string {
  const s = cms == null ? "" : String(cms).trim();
  if (isDefaultCmsLocale(lang)) {
    return s !== "" ? String(cms) : t(i18nKey);
  }
  return t(i18nKey);
}

/** 统计数字在后台多为 20+ / 1200+ 等，非中文时仍允许使用这类「通用」CMS 值。 */
function isUniversalStatValue(s: string): boolean {
  return /^[\d+.%\s-]+$/.test(s.trim());
}

export function cmsStatValue(lang: string | undefined, cms: unknown, fallback: string): string {
  const s = cms == null ? "" : String(cms).trim();
  if (s === "") return fallback;
  if (isDefaultCmsLocale(lang)) return s;
  if (isUniversalStatValue(s)) return s;
  return fallback;
}

export function mergeSystemsWithI18n(
  lang: string | undefined,
  cmsList: SystemShape[],
  fallback: SystemShape[],
): SystemShape[] {
  if (isDefaultCmsLocale(lang)) return cmsList;
  return cmsList.map((item) => {
    const id = String(item.id || "");
    const fb = fallback.find((f) => f.id === id);
    if (fb && (id === "s1" || id === "s2" || id === "s3")) {
      return {
        ...item,
        title: fb.title,
        description: fb.description,
        features: [...fb.features],
        image: (item.image || "").trim() ? item.image : fb.image,
      };
    }
    if (fb) {
      return { ...item, image: (item.image || "").trim() ? item.image : fb.image };
    }
    return item;
  });
}

export function mergeProjectsWithI18n(
  lang: string | undefined,
  cmsList: ProjectShape[],
  fallback: ProjectShape[],
): ProjectShape[] {
  if (isDefaultCmsLocale(lang)) return cmsList;
  return cmsList.map((item) => {
    const id = String(item.id || "");
    const fb = fallback.find((f) => f.id === id);
    if (fb && (id === "p1" || id === "p2" || id === "p3")) {
      return {
        ...item,
        title: fb.title,
        location: fb.location,
        description: fb.description,
        image: (item.image || "").trim() ? item.image : fb.image,
      };
    }
    if (fb) {
      return { ...item, image: (item.image || "").trim() ? item.image : fb.image };
    }
    return item;
  });
}
