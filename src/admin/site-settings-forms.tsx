import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { SITE_IMAGE_SPECS } from "../lib/media-specs";
import { AdminLocalImageField, AdminLocalVideoField } from "./AdminLocalMediaField";

/** 有固定表单字段的站点配置 key（与 server PUBLIC_SITE_SETTING_KEYS 对齐；其他 key 走 JSON） */
export const SITE_SETTING_FORM_KEYS = [
  "contact",
  "home.hero",
  "home.consultation",
  "home.systems",
  "home.projects",
  "home.logistics",
  "footer",
  "catalog.customSpec",
  "about.page",
] as const;

export type SiteSettingFormKey = (typeof SITE_SETTING_FORM_KEYS)[number];

export function hasStructuredSiteSettingForm(key: string): key is SiteSettingFormKey {
  return (SITE_SETTING_FORM_KEYS as readonly string[]).includes(key);
}

/** 后台配置列表展示用中文名（便于找到「关于我们」等） */
export const SITE_SETTING_LIST_LABEL: Record<string, string> = {
  contact: "联系信息",
  "home.hero": "首页 · 首屏大图与主文案",
  "home.consultation": "首页 · 咨询区块",
  "home.systems": "首页 · 核心系统方案",
  "home.projects": "首页/案例 · 工程案例",
  "home.logistics": "首页 · 物流与轮播图",
  footer: "全站页脚",
  "catalog.customSpec": "目录页 · 联系定制",
  "about.page": "关于我们页 · Hero 与简介",
};

const inputClass =
  "w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-industrial-blue";
const labelClass = "block text-xs font-bold text-gray-500 uppercase mb-1";

type LinkPair = { label: string; href: string };

function emptyContact() {
  return { phone: "", email: "", whatsapp: "", address: "" };
}

function emptyHero() {
  return {
    heroImageUrl: "",
    heroImageAlt: "",
    overlayOpacity: 0.6,
    badge: "",
    heroTitleLine1: "",
    heroTitleAccent: "",
    heroDesc1: "",
    heroDesc2: "",
    browseCatalog: "",
    viewProjects: "",
    statsYearsValue: "",
    statsYearsLabel: "",
    statsProjectsValue: "",
    statsProjectsLabel: "",
    statsSatisfactionValue: "",
    statsSatisfactionLabel: "",
  };
}

function emptyConsultation() {
  return {
    title: "",
    description: "",
    backgroundOpacity: 0.45,
    hotlineLabel: "WhatsApp",
    hotlineValue: "",
  };
}

function emptyCustomSpec() {
  return { title: "", description: "", buttonText: "", note: "" };
}

function emptyLogistics() {
  return {
    title: "",
    description: "",
    cards: [
      { title: "", description: "" },
      { title: "", description: "" },
    ] as Array<{ title: string; description: string }>,
    /** 轮播图 URL（本地上传）；旧数据仅有 slideSeeds 时打开表单会临时转成外链预览，保存后写入本字段 */
    slideImageUrls: [] as string[],
    trackTitle: "",
    trackOrderId: "",
    trackStatus: "",
    trackLocation: "",
    trackEta: "",
  };
}

function emptyAboutPage() {
  return {
    heroTitle: "",
    heroVideoUrl: "",
    heroImageUrl: "",
    heroOverlayOpacity: 0.4,
    profileEyebrow: "",
    profileHeading: "",
    profileBody: "",
  };
}

function emptyFooter() {
  return {
    tagline: "",
    address: "",
    phone: "",
    email: "",
    copyright: "",
    quickLinks: [] as LinkPair[],
    legalLinks: [] as LinkPair[],
    newsletterTitle: "",
    newsletterDesc: "",
  };
}

type SystemRow = { id: string; title: string; image: string; description: string; featuresText: string };
type ProjectRow = { id: string; title: string; location: string; image: string; description: string };

function systemRowsFromArray(v: unknown): SystemRow[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw, i) => {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const features = Array.isArray(o.features) ? o.features.map(String) : [];
    return {
      id: String(o.id ?? `s${i + 1}`),
      title: String(o.title ?? ""),
      image: String(o.image ?? ""),
      description: String(o.description ?? ""),
      featuresText: features.join("\n"),
    };
  });
}

function projectRowsFromArray(v: unknown): ProjectRow[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw, i) => {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      id: String(o.id ?? `p${i + 1}`),
      title: String(o.title ?? ""),
      location: String(o.location ?? ""),
      image: String(o.image ?? ""),
      description: String(o.description ?? ""),
    };
  });
}

function emptySystemsSectionMeta() {
  return { label: "", sectionTitle: "", viewAllProducts: "", cardTag: "" };
}

function emptyProjectsSectionMeta() {
  return {
    featuredLabel: "",
    sectionTitle: "",
    viewMore: "",
    listingEyebrow: "",
    listingTitle: "",
  };
}

function homeSystemsFromValue(v: unknown): {
  rows: SystemRow[];
  meta: ReturnType<typeof emptySystemsSectionMeta>;
} {
  if (Array.isArray(v)) {
    return { rows: systemRowsFromArray(v), meta: emptySystemsSectionMeta() };
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const arr = o.items ?? o.systems;
    return {
      rows: Array.isArray(arr) ? systemRowsFromArray(arr) : [],
      meta: {
        label: String(o.label ?? ""),
        sectionTitle: String(o.sectionTitle ?? ""),
        viewAllProducts: String(o.viewAllProducts ?? ""),
        cardTag: String(o.cardTag ?? ""),
      },
    };
  }
  return { rows: [], meta: emptySystemsSectionMeta() };
}

function homeProjectsFromValue(v: unknown): {
  rows: ProjectRow[];
  meta: ReturnType<typeof emptyProjectsSectionMeta>;
} {
  if (Array.isArray(v)) {
    return { rows: projectRowsFromArray(v), meta: emptyProjectsSectionMeta() };
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const arr = o.items ?? o.projects;
    return {
      rows: Array.isArray(arr) ? projectRowsFromArray(arr) : [],
      meta: {
        featuredLabel: String(o.featuredLabel ?? ""),
        sectionTitle: String(o.sectionTitle ?? ""),
        viewMore: String(o.viewMore ?? ""),
        listingEyebrow: String(o.listingEyebrow ?? ""),
        listingTitle: String(o.listingTitle ?? ""),
      },
    };
  }
  return { rows: [], meta: emptyProjectsSectionMeta() };
}

function linkListFrom(v: unknown): LinkPair[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    return { label: String(o.label ?? ""), href: String(o.href ?? "") };
  });
}

export function SiteSettingEditDialog({
  open,
  settingKey,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  settingKey: string;
  value: unknown;
  onClose: () => void;
  onSave: (next: unknown) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [jsonText, setJsonText] = useState("{}");
  const [contact, setContact] = useState(emptyContact);
  const [consultation, setConsultation] = useState(emptyConsultation);
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [systemsMeta, setSystemsMeta] = useState(emptySystemsSectionMeta);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsMeta, setProjectsMeta] = useState(emptyProjectsSectionMeta);
  const [logistics, setLogistics] = useState(emptyLogistics);
  const [footer, setFooter] = useState(emptyFooter);
  const [customSpec, setCustomSpec] = useState(emptyCustomSpec);
  const [aboutPage, setAboutPage] = useState(emptyAboutPage);
  const [hero, setHero] = useState(emptyHero);

  const useJson = !hasStructuredSiteSettingForm(settingKey);

  useEffect(() => {
    if (!open) return;
    setJsonText(JSON.stringify(value ?? {}, null, 2));
    const o = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    if (settingKey === "contact") {
      setContact({
        phone: String(o.phone ?? ""),
        email: String(o.email ?? ""),
        whatsapp: String(o.whatsapp ?? ""),
        address: String(o.address ?? ""),
      });
    }
    if (settingKey === "home.hero") {
      setHero({
        heroImageUrl: String(o.heroImageUrl ?? ""),
        heroImageAlt: String(o.heroImageAlt ?? ""),
        overlayOpacity:
          typeof o.overlayOpacity === "number" ? o.overlayOpacity : Number(o.overlayOpacity) || 0.6,
        badge: String(o.badge ?? ""),
        heroTitleLine1: String(o.heroTitleLine1 ?? ""),
        heroTitleAccent: String(o.heroTitleAccent ?? ""),
        heroDesc1: String(o.heroDesc1 ?? ""),
        heroDesc2: String(o.heroDesc2 ?? ""),
        browseCatalog: String(o.browseCatalog ?? ""),
        viewProjects: String(o.viewProjects ?? ""),
        statsYearsValue: String(o.statsYearsValue ?? ""),
        statsYearsLabel: String(o.statsYearsLabel ?? ""),
        statsProjectsValue: String(o.statsProjectsValue ?? ""),
        statsProjectsLabel: String(o.statsProjectsLabel ?? ""),
        statsSatisfactionValue: String(o.statsSatisfactionValue ?? ""),
        statsSatisfactionLabel: String(o.statsSatisfactionLabel ?? ""),
      });
    }
    if (settingKey === "home.consultation") {
      setConsultation({
        title: String(o.title ?? ""),
        description: String(o.description ?? ""),
        backgroundOpacity:
          typeof o.backgroundOpacity === "number" ? o.backgroundOpacity : Number(o.backgroundOpacity) || 0.45,
        hotlineLabel: String(o.hotlineLabel ?? "WhatsApp"),
        hotlineValue: String(o.hotlineValue ?? ""),
      });
    }
    if (settingKey === "home.systems") {
      const { rows, meta } = homeSystemsFromValue(value);
      setSystemsMeta(meta);
      setSystems(rows.length ? rows : [{ id: "s1", title: "", image: "", description: "", featuresText: "" }]);
    }
    if (settingKey === "home.projects") {
      const { rows, meta } = homeProjectsFromValue(value);
      setProjectsMeta(meta);
      setProjects(rows.length ? rows : [{ id: "p1", title: "", location: "", image: "", description: "" }]);
    }
    if (settingKey === "home.logistics") {
      const cards = (Array.isArray(o.cards) ? o.cards : []) as Array<{ title?: string; description?: string }>;
      const cardRows = cards.map((c) => ({
        title: String(c?.title ?? ""),
        description: String(c?.description ?? ""),
      }));
      while (cardRows.length < 2) cardRows.push({ title: "", description: "" });
      const fromUrls = Array.isArray(o.slideImageUrls) ? o.slideImageUrls.map(String).filter(Boolean) : [];
      const seeds = Array.isArray(o.slideSeeds) ? o.slideSeeds.map(String) : [];
      const legacyFromSeeds = seeds.map((s) => `https://picsum.photos/seed/${encodeURIComponent(s)}/1280/720`);
      const slideImageUrls = fromUrls.length > 0 ? fromUrls : legacyFromSeeds;
      setLogistics({
        title: String(o.title ?? ""),
        description: String(o.description ?? ""),
        cards: cardRows,
        slideImageUrls,
        trackTitle: String(o.trackTitle ?? ""),
        trackOrderId: String(o.trackOrderId ?? ""),
        trackStatus: String(o.trackStatus ?? ""),
        trackLocation: String(o.trackLocation ?? ""),
        trackEta: String(o.trackEta ?? ""),
      });
    }
    if (settingKey === "footer") {
      setFooter({
        tagline: String(o.tagline ?? ""),
        address: String(o.address ?? ""),
        phone: String(o.phone ?? ""),
        email: String(o.email ?? ""),
        copyright: String(o.copyright ?? ""),
        quickLinks: linkListFrom(o.quickLinks),
        legalLinks: linkListFrom(o.legalLinks),
        newsletterTitle: String(o.newsletterTitle ?? ""),
        newsletterDesc: String(o.newsletterDesc ?? ""),
      });
    }
    if (settingKey === "catalog.customSpec") {
      setCustomSpec({
        title: String(o.title ?? ""),
        description: String(o.description ?? ""),
        buttonText: String(o.buttonText ?? ""),
        note: String(o.note ?? ""),
      });
    }
    if (settingKey === "about.page") {
      const paras = Array.isArray(o.profileParagraphs) ? o.profileParagraphs.map(String) : [];
      const ho =
        typeof o.heroOverlayOpacity === "number" ? o.heroOverlayOpacity : Number(o.heroOverlayOpacity);
      setAboutPage({
        heroTitle: String(o.heroTitle ?? ""),
        heroVideoUrl: String(o.heroVideoUrl ?? ""),
        heroImageUrl: String(o.heroImageUrl ?? ""),
        heroOverlayOpacity: Number.isFinite(ho) ? ho : 0.4,
        profileEyebrow: String(o.profileEyebrow ?? ""),
        profileHeading: String(o.profileHeading ?? ""),
        profileBody: paras.join("\n\n"),
      });
    }
  }, [open, settingKey, value]);

  const buildPayload = useCallback((): unknown => {
    if (useJson) return JSON.parse(jsonText);
    switch (settingKey) {
      case "contact":
        return { ...contact };
      case "home.hero":
        return {
          ...hero,
          overlayOpacity: Math.min(
            1,
            Math.max(
              0,
              Number.isFinite(Number(hero.overlayOpacity)) ? Number(hero.overlayOpacity) : 0.6,
            ),
          ),
        };
      case "home.consultation":
        return {
          ...consultation,
          backgroundOpacity: Math.min(1, Math.max(0, Number(consultation.backgroundOpacity) || 0)),
        };
      case "home.systems":
        return {
          label: systemsMeta.label,
          sectionTitle: systemsMeta.sectionTitle,
          viewAllProducts: systemsMeta.viewAllProducts,
          cardTag: systemsMeta.cardTag,
          items: systems.map((s) => ({
            id: s.id.trim() || `s-${Math.random().toString(36).slice(2, 8)}`,
            title: s.title,
            image: s.image,
            description: s.description,
            features: s.featuresText
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean),
          })),
        };
      case "home.projects":
        return {
          featuredLabel: projectsMeta.featuredLabel,
          sectionTitle: projectsMeta.sectionTitle,
          viewMore: projectsMeta.viewMore,
          listingEyebrow: projectsMeta.listingEyebrow,
          listingTitle: projectsMeta.listingTitle,
          items: projects.map((p) => ({
            id: p.id.trim() || `p-${Math.random().toString(36).slice(2, 8)}`,
            title: p.title,
            location: p.location,
            image: p.image,
            description: p.description,
          })),
        };
      case "home.logistics":
        return {
          title: logistics.title,
          description: logistics.description,
          cards: logistics.cards.filter((c) => c.title || c.description),
          slideImageUrls: logistics.slideImageUrls.filter(Boolean),
          trackTitle: logistics.trackTitle,
          trackOrderId: logistics.trackOrderId,
          trackStatus: logistics.trackStatus,
          trackLocation: logistics.trackLocation,
          trackEta: logistics.trackEta,
        };
      case "about.page":
        return {
          heroTitle: aboutPage.heroTitle,
          heroVideoUrl: aboutPage.heroVideoUrl,
          heroImageUrl: aboutPage.heroImageUrl,
          heroOverlayOpacity: Math.min(
            1,
            Math.max(
              0,
              Number.isFinite(Number(aboutPage.heroOverlayOpacity))
                ? Number(aboutPage.heroOverlayOpacity)
                : 0.4,
            ),
          ),
          profileEyebrow: aboutPage.profileEyebrow,
          profileHeading: aboutPage.profileHeading,
          profileParagraphs: aboutPage.profileBody
            .split(/\n\n+/)
            .map((x) => x.trim())
            .filter(Boolean),
        };
      case "footer":
        return {
          ...footer,
          quickLinks: footer.quickLinks.filter((l) => l.label || l.href),
          legalLinks: footer.legalLinks.filter((l) => l.label || l.href),
        };
      case "catalog.customSpec":
        return { ...customSpec };
      default:
        return JSON.parse(jsonText);
    }
  }, [
    useJson,
    jsonText,
    settingKey,
    contact,
    consultation,
    systems,
    systemsMeta,
    projects,
    projectsMeta,
    logistics,
    footer,
    customSpec,
    aboutPage,
    hero,
  ]);

  const handleSave = async () => {
    try {
      let payload: unknown;
      if (useJson) {
        payload = JSON.parse(jsonText);
      } else {
        payload = buildPayload();
      }
      setSaving(true);
      await onSave(payload);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(useJson ? `JSON 无效或保存失败：${msg}` : `保存失败：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const title = useMemo(() => {
    const labels: Record<string, string> = {
      contact: "联系信息（弹窗 / 侧栏）",
      "home.hero": "首页 · 首屏大图与主文案",
      "home.consultation": "首页 · 咨询区块",
      "home.systems": "首页 · 核心系统方案",
      "home.projects": "首页 / 案例 · 工程案例列表",
      "home.logistics": "首页 · 全球物流与追踪",
      footer: "全站页脚",
      "catalog.customSpec": "目录页 · 联系定制",
      "about.page": "关于我们页",
    };
    return labels[settingKey] ?? settingKey;
  }, [settingKey]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-setting-dialog-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white rounded-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100 ${
          settingKey === "about.page" ||
          settingKey === "home.hero" ||
          settingKey === "home.systems" ||
          settingKey === "home.projects"
            ? "max-w-3xl"
            : "max-w-2xl"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center gap-2">
          <div className="min-w-0">
            <div id="site-setting-dialog-title" className="text-sm font-bold text-industrial-blue truncate">
              {title}
            </div>
            <div className="text-[10px] font-mono text-gray-400 truncate">{settingKey}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-sm">
          {useJson && (
            <div>
              <p className="text-xs text-gray-500 mb-2">此配置项无固定表单，请直接编辑 JSON。</p>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="w-full h-72 font-mono text-xs bg-white border border-gray-200 rounded-xl p-3 outline-none focus:ring-1 focus:ring-industrial-blue"
              />
            </div>
          )}

          {settingKey === "home.hero" && (
            <div className="space-y-4">
              <AdminLocalImageField
                label="首屏背景图（本地上传）"
                hint={SITE_IMAGE_SPECS.heroBackground.label}
                value={hero.heroImageUrl}
                onChange={(url) => setHero({ ...hero, heroImageUrl: url })}
                width={SITE_IMAGE_SPECS.heroBackground.width}
                height={SITE_IMAGE_SPECS.heroBackground.height}
                tolerance={SITE_IMAGE_SPECS.heroBackground.tolerance}
              />
              <div>
                <label className={labelClass}>背景图 alt 文案（无障碍 / SEO）</label>
                <input
                  className={inputClass}
                  value={hero.heroImageAlt}
                  onChange={(e) => setHero({ ...hero, heroImageAlt: e.target.value })}
                  placeholder="留空则使用默认说明"
                />
              </div>
              <div>
                <label className={labelClass}>蓝色遮罩透明度（0～1，越大越深）</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className={inputClass}
                  value={hero.overlayOpacity}
                  onChange={(e) => setHero({ ...hero, overlayOpacity: Number(e.target.value) })}
                />
              </div>
              <div className="text-xs font-bold text-gray-600 border-t border-gray-100 pt-3">主文案（留空则使用翻译文件中的默认文案）</div>
              <div>
                <label className={labelClass}>橙色小标签</label>
                <input className={inputClass} value={hero.badge} onChange={(e) => setHero({ ...hero, badge: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>大标题 · 第一行（白色）</label>
                  <input
                    className={inputClass}
                    value={hero.heroTitleLine1}
                    onChange={(e) => setHero({ ...hero, heroTitleLine1: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>大标题 · 第二行（橙色强调）</label>
                  <input
                    className={inputClass}
                    value={hero.heroTitleAccent}
                    onChange={(e) => setHero({ ...hero, heroTitleAccent: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>副标题第一段</label>
                <textarea
                  className={`${inputClass} min-h-[56px]`}
                  value={hero.heroDesc1}
                  onChange={(e) => setHero({ ...hero, heroDesc1: e.target.value })}
                />
              </div>
              <div>
                <label className={labelClass}>副标题第二段</label>
                <textarea
                  className={`${inputClass} min-h-[56px]`}
                  value={hero.heroDesc2}
                  onChange={(e) => setHero({ ...hero, heroDesc2: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>主按钮文案（浏览目录）</label>
                  <input
                    className={inputClass}
                    value={hero.browseCatalog}
                    onChange={(e) => setHero({ ...hero, browseCatalog: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>次按钮文案（工程案例）</label>
                  <input
                    className={inputClass}
                    value={hero.viewProjects}
                    onChange={(e) => setHero({ ...hero, viewProjects: e.target.value })}
                  />
                </div>
              </div>
              <div className="text-xs font-bold text-gray-600 border-t border-gray-100 pt-3">右下角数据条（数值与说明均可替换）</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>经验 · 数字</label>
                  <input
                    className={inputClass}
                    value={hero.statsYearsValue}
                    onChange={(e) => setHero({ ...hero, statsYearsValue: e.target.value })}
                    placeholder="如 20+"
                  />
                </div>
                <div>
                  <label className={labelClass}>经验 · 说明</label>
                  <input
                    className={inputClass}
                    value={hero.statsYearsLabel}
                    onChange={(e) => setHero({ ...hero, statsYearsLabel: e.target.value })}
                  />
                </div>
                <div />
                <div>
                  <label className={labelClass}>项目 · 数字</label>
                  <input
                    className={inputClass}
                    value={hero.statsProjectsValue}
                    onChange={(e) => setHero({ ...hero, statsProjectsValue: e.target.value })}
                    placeholder="如 1200+"
                  />
                </div>
                <div>
                  <label className={labelClass}>项目 · 说明</label>
                  <input
                    className={inputClass}
                    value={hero.statsProjectsLabel}
                    onChange={(e) => setHero({ ...hero, statsProjectsLabel: e.target.value })}
                  />
                </div>
                <div />
                <div>
                  <label className={labelClass}>满意度 · 数字</label>
                  <input
                    className={inputClass}
                    value={hero.statsSatisfactionValue}
                    onChange={(e) => setHero({ ...hero, statsSatisfactionValue: e.target.value })}
                    placeholder="如 98%"
                  />
                </div>
                <div>
                  <label className={labelClass}>满意度 · 说明</label>
                  <input
                    className={inputClass}
                    value={hero.statsSatisfactionLabel}
                    onChange={(e) => setHero({ ...hero, statsSatisfactionLabel: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {settingKey === "contact" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelClass}>电话</label>
                <input className={inputClass} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>邮箱</label>
                <input className={inputClass} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>WhatsApp</label>
                <input className={inputClass} value={contact.whatsapp} onChange={(e) => setContact({ ...contact, whatsapp: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>地址</label>
                <textarea className={`${inputClass} min-h-[72px]`} value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
              </div>
            </div>
          )}

          {settingKey === "home.consultation" && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>标题</label>
                <input className={inputClass} value={consultation.title} onChange={(e) => setConsultation({ ...consultation, title: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>描述</label>
                <textarea className={`${inputClass} min-h-[80px]`} value={consultation.description} onChange={(e) => setConsultation({ ...consultation, description: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>背景透明度（0～1）</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className={inputClass}
                  value={consultation.backgroundOpacity}
                  onChange={(e) => setConsultation({ ...consultation, backgroundOpacity: Number(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>热线标签（如 WhatsApp）</label>
                  <input className={inputClass} value={consultation.hotlineLabel} onChange={(e) => setConsultation({ ...consultation, hotlineLabel: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>热线号码 / 账号</label>
                  <input className={inputClass} value={consultation.hotlineValue} onChange={(e) => setConsultation({ ...consultation, hotlineValue: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {settingKey === "home.systems" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                下方区块标题、卡片角标等与翻译文件一致时可留空；填写后覆盖前台显示。保存后数据为「对象 + items
                列表」，旧版纯数组数据仍兼容。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-gray-100 rounded-xl p-3">
                <div className="sm:col-span-2">
                  <label className={labelClass}>区块小标题（如 系统方案）</label>
                  <input
                    className={inputClass}
                    value={systemsMeta.label}
                    onChange={(e) => setSystemsMeta({ ...systemsMeta, label: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>区块主标题（如 核心系统解决方案）</label>
                  <input
                    className={inputClass}
                    value={systemsMeta.sectionTitle}
                    onChange={(e) => setSystemsMeta({ ...systemsMeta, sectionTitle: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>右侧链接文字（如 查看全部产品）</label>
                  <input
                    className={inputClass}
                    value={systemsMeta.viewAllProducts}
                    onChange={(e) => setSystemsMeta({ ...systemsMeta, viewAllProducts: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>卡片内橙色角标（默认同小标题）</label>
                  <input
                    className={inputClass}
                    value={systemsMeta.cardTag}
                    onChange={(e) => setSystemsMeta({ ...systemsMeta, cardTag: e.target.value })}
                    placeholder="留空则使用「区块小标题」或翻译默认"
                  />
                </div>
              </div>
              <div className="text-xs font-bold text-gray-600">方案卡片列表</div>
              {systems.map((s, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2 relative">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500">方案 #{idx + 1}</span>
                    <button
                      type="button"
                      className="text-red-500 p-1 hover:bg-red-50 rounded-lg"
                      onClick={() => setSystems((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={systems.length <= 1}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <input placeholder="id" className={inputClass} value={s.id} onChange={(e) => setSystems((prev) => prev.map((x, i) => (i === idx ? { ...x, id: e.target.value } : x)))} />
                  <input placeholder="标题" className={inputClass} value={s.title} onChange={(e) => setSystems((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))} />
                  <AdminLocalImageField
                    label="封面图（本地上传）"
                    hint={SITE_IMAGE_SPECS.cardCover.label}
                    value={s.image}
                    onChange={(url) => setSystems((prev) => prev.map((x, i) => (i === idx ? { ...x, image: url } : x)))}
                    width={SITE_IMAGE_SPECS.cardCover.width}
                    height={SITE_IMAGE_SPECS.cardCover.height}
                    tolerance={SITE_IMAGE_SPECS.cardCover.tolerance}
                  />
                  <textarea placeholder="描述" className={`${inputClass} min-h-[60px]`} value={s.description} onChange={(e) => setSystems((prev) => prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))} />
                  <div>
                    <label className={labelClass}>特性（每行一条）</label>
                    <textarea className={`${inputClass} min-h-[72px]`} value={s.featuresText} onChange={(e) => setSystems((prev) => prev.map((x, i) => (i === idx ? { ...x, featuresText: e.target.value } : x)))} />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-bold text-industrial-blue border border-dashed border-industrial-blue/40 rounded-xl px-3 py-2 w-full justify-center hover:bg-industrial-blue/5"
                onClick={() =>
                  setSystems((prev) => [
                    ...prev,
                    { id: `s${prev.length + 1}`, title: "", image: "", description: "", featuresText: "" },
                  ])
                }
              >
                <Plus size={16} /> 添加方案
              </button>
            </div>
          )}

          {settingKey === "home.projects" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                首页「经典工程案例」区块与「工程案例」独立列表页的标题均可在此配置；留空则用翻译文件默认。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-gray-100 rounded-xl p-3">
                <div className="sm:col-span-2 text-[11px] font-bold text-gray-500 uppercase">首页区块</div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>小标签（如 精选案例）</label>
                  <input
                    className={inputClass}
                    value={projectsMeta.featuredLabel}
                    onChange={(e) => setProjectsMeta({ ...projectsMeta, featuredLabel: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>主标题（如 经典工程案例）</label>
                  <input
                    className={inputClass}
                    value={projectsMeta.sectionTitle}
                    onChange={(e) => setProjectsMeta({ ...projectsMeta, sectionTitle: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>「查看更多」链接文字</label>
                  <input
                    className={inputClass}
                    value={projectsMeta.viewMore}
                    onChange={(e) => setProjectsMeta({ ...projectsMeta, viewMore: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2 text-[11px] font-bold text-gray-500 uppercase pt-2">工程案例列表页</div>
                <div>
                  <label className={labelClass}>页眉小标题</label>
                  <input
                    className={inputClass}
                    value={projectsMeta.listingEyebrow}
                    onChange={(e) => setProjectsMeta({ ...projectsMeta, listingEyebrow: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>页面主标题</label>
                  <input
                    className={inputClass}
                    value={projectsMeta.listingTitle}
                    onChange={(e) => setProjectsMeta({ ...projectsMeta, listingTitle: e.target.value })}
                  />
                </div>
              </div>
              <div className="text-xs font-bold text-gray-600">案例卡片列表</div>
              {projects.map((p, idx) => (
                <div key={idx} className="border border-gray-100 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500">案例 #{idx + 1}</span>
                    <button
                      type="button"
                      className="text-red-500 p-1 hover:bg-red-50 rounded-lg"
                      onClick={() => setProjects((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={projects.length <= 1}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <input placeholder="id" className={inputClass} value={p.id} onChange={(e) => setProjects((prev) => prev.map((x, i) => (i === idx ? { ...x, id: e.target.value } : x)))} />
                  <input placeholder="标题" className={inputClass} value={p.title} onChange={(e) => setProjects((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))} />
                  <input placeholder="地点" className={inputClass} value={p.location} onChange={(e) => setProjects((prev) => prev.map((x, i) => (i === idx ? { ...x, location: e.target.value } : x)))} />
                  <AdminLocalImageField
                    label="封面图（本地上传）"
                    hint={SITE_IMAGE_SPECS.cardCover.label}
                    value={p.image}
                    onChange={(url) => setProjects((prev) => prev.map((x, i) => (i === idx ? { ...x, image: url } : x)))}
                    width={SITE_IMAGE_SPECS.cardCover.width}
                    height={SITE_IMAGE_SPECS.cardCover.height}
                    tolerance={SITE_IMAGE_SPECS.cardCover.tolerance}
                  />
                  <textarea placeholder="描述" className={`${inputClass} min-h-[80px]`} value={p.description} onChange={(e) => setProjects((prev) => prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))} />
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-bold text-industrial-blue border border-dashed border-industrial-blue/40 rounded-xl px-3 py-2 w-full justify-center hover:bg-industrial-blue/5"
                onClick={() =>
                  setProjects((prev) => [
                    ...prev,
                    { id: `p${prev.length + 1}`, title: "", location: "", image: "", description: "" },
                  ])
                }
              >
                <Plus size={16} /> 添加案例
              </button>
            </div>
          )}

          {settingKey === "home.logistics" && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>区块标题</label>
                <input className={inputClass} value={logistics.title} onChange={(e) => setLogistics({ ...logistics, title: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>区块描述</label>
                <textarea className={`${inputClass} min-h-[72px]`} value={logistics.description} onChange={(e) => setLogistics({ ...logistics, description: e.target.value })} />
              </div>
              <div className="text-xs font-bold text-gray-600">左侧卡片</div>
              {logistics.cards.map((c, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 pl-2 border-l-2 border-heat-accent/40">
                  <input placeholder={`卡片 ${idx + 1} 标题`} className={inputClass} value={c.title} onChange={(e) =>
                    setLogistics((L) => ({
                      ...L,
                      cards: L.cards.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                    }))
                  }
                  />
                  <textarea placeholder="描述" className={`${inputClass} min-h-[48px]`} value={c.description} onChange={(e) =>
                    setLogistics((L) => ({
                      ...L,
                      cards: L.cards.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)),
                    }))
                  }
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-xs font-bold text-industrial-blue"
                onClick={() => setLogistics((L) => ({ ...L, cards: [...L.cards, { title: "", description: "" }] }))}
              >
                + 添加卡片
              </button>
              <div className="text-xs font-bold text-gray-600">右侧轮播图（本地上传，{SITE_IMAGE_SPECS.logisticsSlide.label}）</div>
              <p className="text-[11px] text-gray-400">由旧 seed 同步来的外链图可逐张重新上传替换为本地文件。</p>
              {logistics.slideImageUrls.map((url, idx) => (
                <div key={`slide-${idx}`} className="border border-gray-100 rounded-xl p-3 space-y-2 relative">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500">轮播 #{idx + 1}</span>
                    <button
                      type="button"
                      className="text-red-500 p-1 hover:bg-red-50 rounded-lg"
                      onClick={() =>
                        setLogistics((L) => ({
                          ...L,
                          slideImageUrls: L.slideImageUrls.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <AdminLocalImageField
                    label=""
                    hint={SITE_IMAGE_SPECS.logisticsSlide.label}
                    value={url}
                    onChange={(next) =>
                      setLogistics((L) => ({
                        ...L,
                        slideImageUrls: L.slideImageUrls.map((u, i) => (i === idx ? next : u)),
                      }))
                    }
                    width={SITE_IMAGE_SPECS.logisticsSlide.width}
                    height={SITE_IMAGE_SPECS.logisticsSlide.height}
                    tolerance={SITE_IMAGE_SPECS.logisticsSlide.tolerance}
                  />
                </div>
              ))}
              <button
                type="button"
                className="flex items-center gap-2 text-xs font-bold text-industrial-blue border border-dashed border-industrial-blue/40 rounded-xl px-3 py-2 w-full justify-center hover:bg-industrial-blue/5"
                onClick={() => setLogistics((L) => ({ ...L, slideImageUrls: [...L.slideImageUrls, ""] }))}
              >
                <Plus size={16} /> 添加一张轮播图
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>追踪卡片标题</label>
                  <input className={inputClass} value={logistics.trackTitle} onChange={(e) => setLogistics({ ...logistics, trackTitle: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>示例订单号</label>
                  <input className={inputClass} value={logistics.trackOrderId} onChange={(e) => setLogistics({ ...logistics, trackOrderId: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>状态文案</label>
                  <input className={inputClass} value={logistics.trackStatus} onChange={(e) => setLogistics({ ...logistics, trackStatus: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>当前位置</label>
                  <input className={inputClass} value={logistics.trackLocation} onChange={(e) => setLogistics({ ...logistics, trackLocation: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>预计到达</label>
                  <input className={inputClass} value={logistics.trackEta} onChange={(e) => setLogistics({ ...logistics, trackEta: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {settingKey === "footer" && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>标语</label>
                <textarea className={`${inputClass} min-h-[56px]`} value={footer.tagline} onChange={(e) => setFooter({ ...footer, tagline: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>地址</label>
                <input className={inputClass} value={footer.address} onChange={(e) => setFooter({ ...footer, address: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>电话</label>
                  <input className={inputClass} value={footer.phone} onChange={(e) => setFooter({ ...footer, phone: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>邮箱</label>
                  <input className={inputClass} value={footer.email} onChange={(e) => setFooter({ ...footer, email: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={labelClass}>版权行</label>
                <input className={inputClass} value={footer.copyright} onChange={(e) => setFooter({ ...footer, copyright: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>订阅标题</label>
                <input className={inputClass} value={footer.newsletterTitle} onChange={(e) => setFooter({ ...footer, newsletterTitle: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>订阅说明</label>
                <textarea className={`${inputClass} min-h-[48px]`} value={footer.newsletterDesc} onChange={(e) => setFooter({ ...footer, newsletterDesc: e.target.value })} />
              </div>
              <div className="text-xs font-bold text-gray-600">快捷链接</div>
              {footer.quickLinks.map((l, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input placeholder="文字" className={inputClass} value={l.label} onChange={(e) =>
                    setFooter((f) => ({
                      ...f,
                      quickLinks: f.quickLinks.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                    }))
                  }
                  />
                  <input placeholder="链接" className={inputClass} value={l.href} onChange={(e) =>
                    setFooter((f) => ({
                      ...f,
                      quickLinks: f.quickLinks.map((x, i) => (i === idx ? { ...x, href: e.target.value } : x)),
                    }))
                  }
                  />
                  <button type="button" className="p-2 text-red-500" onClick={() => setFooter((f) => ({ ...f, quickLinks: f.quickLinks.filter((_, i) => i !== idx) }))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button type="button" className="text-xs font-bold text-industrial-blue" onClick={() => setFooter((f) => ({ ...f, quickLinks: [...f.quickLinks, { label: "", href: "" }] }))}>
                + 添加快捷链接
              </button>
              <div className="text-xs font-bold text-gray-600 pt-2">底部法律链接</div>
              {footer.legalLinks.map((l, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input placeholder="文字" className={inputClass} value={l.label} onChange={(e) =>
                    setFooter((f) => ({
                      ...f,
                      legalLinks: f.legalLinks.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                    }))
                  }
                  />
                  <input placeholder="链接" className={inputClass} value={l.href} onChange={(e) =>
                    setFooter((f) => ({
                      ...f,
                      legalLinks: f.legalLinks.map((x, i) => (i === idx ? { ...x, href: e.target.value } : x)),
                    }))
                  }
                  />
                  <button type="button" className="p-2 text-red-500" onClick={() => setFooter((f) => ({ ...f, legalLinks: f.legalLinks.filter((_, i) => i !== idx) }))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button type="button" className="text-xs font-bold text-industrial-blue" onClick={() => setFooter((f) => ({ ...f, legalLinks: [...f.legalLinks, { label: "", href: "" }] }))}>
                + 添加法律链接
              </button>
            </div>
          )}

          {settingKey === "about.page" && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Hero 标题（关于青泰）</label>
                <input className={inputClass} value={aboutPage.heroTitle} onChange={(e) => setAboutPage({ ...aboutPage, heroTitle: e.target.value })} />
              </div>
              <AdminLocalVideoField label="Hero 背景视频（无图时使用）" value={aboutPage.heroVideoUrl} onChange={(url) => setAboutPage({ ...aboutPage, heroVideoUrl: url })} />
              <AdminLocalImageField
                label="Hero 背景图（可选，上传后优先于视频显示）"
                hint={SITE_IMAGE_SPECS.heroBackground.label}
                value={aboutPage.heroImageUrl}
                onChange={(url) => setAboutPage({ ...aboutPage, heroImageUrl: url })}
                width={SITE_IMAGE_SPECS.heroBackground.width}
                height={SITE_IMAGE_SPECS.heroBackground.height}
                tolerance={SITE_IMAGE_SPECS.heroBackground.tolerance}
              />
              <div>
                <label className={labelClass}>Hero 蓝色遮罩透明度（0～1）</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  className={inputClass}
                  value={aboutPage.heroOverlayOpacity}
                  onChange={(e) =>
                    setAboutPage({ ...aboutPage, heroOverlayOpacity: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>小标题（如 Company Profile）</label>
                <input className={inputClass} value={aboutPage.profileEyebrow} onChange={(e) => setAboutPage({ ...aboutPage, profileEyebrow: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>主标题</label>
                <input className={inputClass} value={aboutPage.profileHeading} onChange={(e) => setAboutPage({ ...aboutPage, profileHeading: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>正文段落（段与段之间空一行）</label>
                <textarea
                  className={`${inputClass} min-h-[200px]`}
                  value={aboutPage.profileBody}
                  onChange={(e) => setAboutPage({ ...aboutPage, profileBody: e.target.value })}
                />
              </div>
            </div>
          )}

          {settingKey === "catalog.customSpec" && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>标题</label>
                <input className={inputClass} value={customSpec.title} onChange={(e) => setCustomSpec({ ...customSpec, title: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>描述</label>
                <textarea className={`${inputClass} min-h-[64px]`} value={customSpec.description} onChange={(e) => setCustomSpec({ ...customSpec, description: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>按钮文字</label>
                <input className={inputClass} value={customSpec.buttonText} onChange={(e) => setCustomSpec({ ...customSpec, buttonText: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>备注（仅后台说明，可不填）</label>
                <textarea className={`${inputClass} min-h-[48px]`} value={customSpec.note} onChange={(e) => setCustomSpec({ ...customSpec, note: e.target.value })} />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-4 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold hover:bg-heat-accent hover:text-industrial-blue transition-colors disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
