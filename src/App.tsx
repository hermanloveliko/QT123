import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE,
  apiJson,
  getLang,
  setLang,
  SUPPORTED_LANGS,
  type Lang,
  toLegacyProduct,
  type AdminUser,
  type ApiProduct,
  type Country,
  type Port,
  type Product,
} from "./lib/api";
import { useTranslation } from "react-i18next";
import { GB, ES, PT, MY, CN, FR, RU, KR, TH, VN, SA, TZ } from "country-flag-icons/react/3x2";
import { 
  Menu, 
  X, 
  Search, 
  ShoppingCart, 
  Phone, 
  Mail, 
  MapPin, 
  Facebook, 
  Twitter, 
  Linkedin, 
  Instagram,
  ArrowRight,
  ChevronRight,
  Star,
  Package,
  Truck,
  ShieldCheck,
  Zap,
  Plus,
  Minus,
  Trash2,
  Download,
  Share2,
  Info,
  Pencil
} from "lucide-react";
import {
  SiteSettingEditDialog,
  SITE_SETTING_FORM_KEYS,
  SITE_SETTING_LIST_LABEL,
  hasStructuredSiteSettingForm,
} from "./admin/site-settings-forms";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---
type Page =
  | "home"
  | "catalog"
  | "detail"
  | "cart"
  | "projects"
  | "projectDetail"
  | "about"
  | "systemDetail"
  | "admin";

type AdminTab = "settings" | "products" | "ports" | "pricing" | "orders" | "ai";

const LANG_FLAG_ITEMS: Array<{
  lang: Lang;
  Flag: React.ComponentType<{ title?: string; className?: string }>;
}> = [
  { lang: "zh", Flag: CN },
  { lang: "en", Flag: GB }, // UK English (confirmed)
  { lang: "fr", Flag: FR },
  { lang: "es", Flag: ES }, // Spain (confirmed)
  { lang: "pt", Flag: PT }, // Portugal (confirmed)
  { lang: "ru", Flag: RU },
  { lang: "ko", Flag: KR },
  { lang: "ms", Flag: MY }, // Malaysia (confirmed)
  { lang: "th", Flag: TH },
  { lang: "vi", Flag: VN },
  { lang: "ar", Flag: SA },
  { lang: "sw", Flag: TZ },
];

function LanguageFlags({
  variant,
  className,
}: {
  variant: "navbar" | "hero";
  className?: string;
}) {
  const { t, i18n } = useTranslation("common");
  const current = (i18n.language || getLang()) as Lang;

  return (
    <div
      className={[
        "flex items-center gap-2",
        variant === "hero" ? "overflow-x-auto py-1 -mx-1 px-1" : "",
        className || "",
      ].join(" ")}
    >
      {LANG_FLAG_ITEMS.map(({ lang, Flag }) => {
        const active = current === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => {
              i18n.changeLanguage(lang);
              setLang(lang);
              try {
                const url = new URL(window.location.href);
                url.searchParams.set("lang", lang);
                window.history.replaceState(null, "", url.toString());
              } catch {
                // ignore
              }
            }}
            className={[
              "shrink-0 rounded-full ring-1 transition-all",
              active ? "ring-white/70" : "ring-white/20 hover:ring-white/50",
              variant === "navbar" ? "bg-white/0" : "bg-white/10 hover:bg-white/15",
            ].join(" ")}
            aria-label={`Switch language to ${t(`lang.${lang}`)}`}
            title={t(`lang.${lang}`)}
          >
            <Flag className={variant === "navbar" ? "w-6 h-6 rounded-full" : "w-7 h-7 rounded-full"} />
          </button>
        );
      })}
    </div>
  );
}

interface Project {
  id: string;
  title: string;
  location: string;
  image: string;
  description: string;
}

interface System {
  id: string;
  title: string;
  image: string;
  description: string;
  features: string[];
}

function getLocalizedProjects(t: (key: string) => string): Project[] {
  return [
    {
      id: "p1",
      title: t("projects.items.p1.title"),
      location: t("projects.items.p1.location"),
      image: "https://picsum.photos/seed/proj1/800/600",
      description: t("projects.items.p1.description"),
    },
    {
      id: "p2",
      title: t("projects.items.p2.title"),
      location: t("projects.items.p2.location"),
      image: "https://picsum.photos/seed/proj2/800/600",
      description: t("projects.items.p2.description"),
    },
    {
      id: "p3",
      title: t("projects.items.p3.title"),
      location: t("projects.items.p3.location"),
      image: "https://picsum.photos/seed/proj3/800/600",
      description: t("projects.items.p3.description"),
    },
  ];
}

function getLocalizedSystems(t: (key: string) => string): System[] {
  return [
    {
      id: "s1",
      title: t("systems.items.s1.title"),
      image: "https://picsum.photos/seed/sys1/800/600",
      description: t("systems.items.s1.description"),
      features: [
        t("systems.items.s1.features.0"),
        t("systems.items.s1.features.1"),
        t("systems.items.s1.features.2"),
        t("systems.items.s1.features.3"),
      ],
    },
    {
      id: "s2",
      title: t("systems.items.s2.title"),
      image: "https://picsum.photos/seed/sys2/800/600",
      description: t("systems.items.s2.description"),
      features: [
        t("systems.items.s2.features.0"),
        t("systems.items.s2.features.1"),
        t("systems.items.s2.features.2"),
        t("systems.items.s2.features.3"),
      ],
    },
    {
      id: "s3",
      title: t("systems.items.s3.title"),
      image: "https://picsum.photos/seed/sys3/800/600",
      description: t("systems.items.s3.description"),
      features: [
        t("systems.items.s3.features.0"),
        t("systems.items.s3.features.1"),
        t("systems.items.s3.features.2"),
        t("systems.items.s3.features.3"),
      ],
    },
  ];
}

function getFallbackProduct(t: (key: string) => string): Product {
  return {
    id: "__loading__",
    name: t("common.loading"),
    category: "",
    price: 0,
    image: "https://picsum.photos/seed/material/800/600",
    specs: [],
    description: "",
    gallery: ["https://picsum.photos/seed/material/800/600"],
  };
}

// --- Components ---

const Navbar = ({
  activePage,
  setPage,
  cartCount,
  onGetQuote,
  onAdmin,
}: {
  activePage: Page;
  setPage: (p: Page) => void;
  cartCount: number;
  onGetQuote: () => void;
  onAdmin: () => void;
}) => {
  const { t } = useTranslation("common");
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-nav">
      <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPage("home")}>
            <div className="w-10 h-10 bg-industrial-blue flex items-center justify-center text-white font-bold text-xl">Q</div>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-display font-extrabold tracking-tighter text-industrial-blue">青泰建材</span>
              <span className="text-[10px] tracking-[0.2em] text-gray-500 uppercase">Qingtai Materials</span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button onClick={() => setPage("home")} className={`${activePage === "home" ? "text-industrial-blue" : "text-gray-500"} hover:text-industrial-blue transition-colors`}>{t("nav.home")}</button>
            <button onClick={() => setPage("catalog")} className={`${activePage === "catalog" ? "text-industrial-blue" : "text-gray-500"} hover:text-industrial-blue transition-colors`}>{t("nav.catalog")}</button>
            <button onClick={() => setPage("projects")} className={`${activePage === "projects" ? "text-industrial-blue" : "text-gray-500"} hover:text-industrial-blue transition-colors`}>{t("nav.projects")}</button>
            <button onClick={() => setPage("about")} className={`${activePage === "about" ? "text-industrial-blue" : "text-gray-500"} hover:text-industrial-blue transition-colors`}>{t("nav.about")}</button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center">
            <LanguageFlags variant="navbar" className="mr-2" />
          </div>
          <div className="hidden lg:flex items-center bg-gray-100 rounded-full px-4 py-2 gap-2">
            <button
              onClick={onAdmin}
              className="ml-1 w-6 h-6 rounded-full bg-industrial-blue text-white text-xs font-bold flex items-center justify-center"
              title={t("nav.admin")}
            >
              Q
            </button>
            <Search size={16} className="text-gray-400" />
            <input type="text" placeholder={t("nav.searchPlaceholder")} className="bg-transparent border-none focus:ring-0 text-sm w-40" />
          </div>
          <button onClick={() => setPage("cart")} className="relative p-2 text-industrial-blue hover:bg-gray-100 rounded-full transition-colors">
            <ShoppingCart size={24} />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 bg-heat-accent text-industrial-blue text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
                {cartCount}
              </span>
            )}
          </button>
          <button onClick={onGetQuote} className="btn-primary hidden sm:flex">
            {t("nav.getQuote")}
          </button>
          <button className="md:hidden p-2">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </nav>
  );
};

const AdminLoginModal = ({
  isOpen,
  onClose,
  onLoggedIn,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLoggedIn: (u: AdminUser) => void;
}) => {
  const [username, setUsername] = useState("QT123");
  const [password, setPassword] = useState("QT123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await apiJson<{ token: string; user: AdminUser }>("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem("admin_token", r.token);
      onLoggedIn(r.user);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full"
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-industrial-blue">
              <X size={24} />
            </button>
            <h3 className="text-2xl font-display font-bold text-industrial-blue mb-2">管理员登录</h3>
            <p className="text-xs text-gray-400 mb-6">登录后进入后台管理（产品/港口/费率/订单/AI记录）。</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">账号</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-industrial-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">密码</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-industrial-blue"
                />
              </div>
              {err && <div className="text-sm text-red-600">{err}</div>}
              <button
                onClick={submit}
                disabled={loading}
                className="w-full py-3 bg-industrial-blue text-white font-bold rounded-xl hover:bg-heat-accent hover:text-industrial-blue transition-colors disabled:opacity-60"
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const AdminPage = ({
  onBack,
}: {
  onBack: () => void;
}) => {
  const [tab, setTab] = useState<AdminTab>("settings");
  const [me, setMe] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiJson<{ user: AdminUser }>("/api/admin/me")
      .then((r) => mounted && setMe(r.user))
      .catch((e: any) => mounted && setError(e?.message || "未登录"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const logout = async () => {
    await apiJson("/api/admin/logout", { method: "POST" });
    localStorage.removeItem("admin_token");
    onBack();
  };

  if (loading) return <div className="pt-32 max-w-5xl mx-auto px-4 text-gray-500">后台加载中...</div>;
  if (!me) {
    return (
      <div className="pt-24 pb-16 max-w-3xl mx-auto px-4">
        <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
          <div className="text-xs text-gray-400 uppercase font-bold mb-2">Admin</div>
          <h1 className="text-3xl font-display font-extrabold text-industrial-blue mb-2">后台登录</h1>
          <p className="text-sm text-red-600 mb-6">当前状态：未登录（{error || "会话不存在"}）</p>
          <InlineAdminLogin
            onSuccess={(u) => {
              setError(null);
              setMe(u);
            }}
          />
          <div className="mt-6">
            <button onClick={onBack} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">
              返回前台
            </button>
          </div>
        </div>
      </div>
    );
  }

  const TabButton = ({ id, label }: { id: AdminTab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-xl text-sm font-bold ${
        tab === id ? "bg-industrial-blue text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="pt-24 pb-16 max-w-7xl mx-auto px-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="text-xs text-gray-400 uppercase font-bold">Admin</div>
          <h1 className="text-3xl font-display font-extrabold text-industrial-blue">后台管理</h1>
          <p className="text-sm text-gray-500 mt-1">当前登录：{me.username}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onBack} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">
            返回前台
          </button>
          <button onClick={logout} className="px-4 py-2 rounded-xl bg-red-50 text-red-700 font-bold hover:bg-red-100">
            退出登录
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <TabButton id="settings" label="站点配置" />
        <TabButton id="products" label="产品管理" />
        <TabButton id="ports" label="国家/港口" />
        <TabButton id="pricing" label="费率" />
        <TabButton id="orders" label="订单" />
        <TabButton id="ai" label="AI记录" />
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <AdminTabs tab={tab} />
      </div>
    </div>
  );
};

function AdminTabs({ tab }: { tab: AdminTab }) {
  if (tab === "settings") return <AdminSettingsTab />;
  if (tab === "products") return <AdminProductsTab />;
  if (tab === "ports") return <AdminPortsTab />;
  if (tab === "pricing") return <AdminPricingTab />;
  if (tab === "orders") return <AdminOrdersTab />;
  return <AdminAiTab />;
}

function InlineAdminLogin({ onSuccess }: { onSuccess: (u: AdminUser) => void }) {
  const [username, setUsername] = useState("QT123");
  const [password, setPassword] = useState("QT123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await apiJson<{ token: string; user: AdminUser }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem("admin_token", r.token);
      onSuccess(r.user);
    } catch (e: any) {
      setErr(e?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">账号</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-industrial-blue"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2">密码</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-industrial-blue"
          />
        </div>
      </div>
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={submit}
          disabled={loading}
          className="px-4 py-3 rounded-xl bg-industrial-blue text-white font-bold hover:bg-heat-accent hover:text-industrial-blue transition-colors disabled:opacity-60"
        >
          {loading ? "登录中..." : "登录后台"}
        </button>
        <button
          onClick={() => {
            setUsername("QT123");
            setPassword("QT123");
          }}
          className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200"
        >
          使用测试账号
        </button>
      </div>
    </div>
  );
}

function TypewriterText({ text, speed = 18 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let idx = 0;
    const timer = setInterval(() => {
      idx += 1;
      setDisplayed(text.slice(0, idx));
      if (idx >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return <>{displayed}</>;
}

function AdminSettingsTab() {
  const [rows, setRows] = useState<Array<{ key: string; value: any }>>([]);
  const [i18nRows, setI18nRows] = useState<Array<{ key: string; value: any }>>([]);
  const [editLang, setEditLang] = useState<Lang>("zh");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState<string>("");
  const [dialogValue, setDialogValue] = useState<unknown>({});
  const [advOpen, setAdvOpen] = useState(false);
  const [advKey, setAdvKey] = useState("");
  const [advJson, setAdvJson] = useState("{}");
  const [batchBusy, setBatchBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setErr(null);
    apiJson<Array<{ key: string; value: any }>>("/api/admin/site-settings")
      .then((r) => setRows(r))
      .catch((e: any) => setErr(e?.message || "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (editLang === "zh") {
      setI18nRows([]);
      return;
    }
    apiJson<Array<{ key: string; value: any }>>(`/api/admin/site-settings-i18n?lang=${encodeURIComponent(editLang)}`)
      .then((r) => setI18nRows(r))
      .catch(() => setI18nRows([]));
  }, [editLang]);

  const runBatch = async (mode: "empty" | "copyZh" | "machine") => {
    if (editLang === "zh") {
      alert("请切换到非中文语言后再批量生成翻译");
      return;
    }
    if (batchBusy) return;
    const ok = confirm(`将对站点配置执行批量操作：${mode}（目标语言 ${editLang.toUpperCase()}）。继续？`);
    if (!ok) return;
    setBatchBusy(true);
    try {
      const r = await apiJson<any>("/api/admin/i18n/batch", {
        method: "POST",
        body: JSON.stringify({ entity: "siteSettings", lang: editLang, mode }),
      });
      await apiJson<Array<{ key: string; value: any }>>(`/api/admin/site-settings-i18n?lang=${encodeURIComponent(editLang)}`)
        .then((rows) => setI18nRows(rows))
        .catch(() => setI18nRows([]));
      alert(`批量完成：创建 ${r.created}，更新 ${r.updated}，跳过 ${r.skipped}，失败 ${r.failures?.length || 0}`);
    } catch (e: any) {
      alert(e?.message || "批量失败");
    } finally {
      setBatchBusy(false);
    }
  };

  /** 固定表单 key 始终显示；未写入数据库的项可点开首次保存即创建（避免看不到「关于我们」） */
  const displayRows = useMemo(() => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const byKeyI18n = new Map(i18nRows.map((r) => [r.key, r]));
    const out: Array<{ key: string; value: unknown; missingInDb: boolean }> = [];
    for (const k of SITE_SETTING_FORM_KEYS) {
      const r = byKey.get(k);
      const rI = byKeyI18n.get(k);
      const v = editLang === "zh" ? (r?.value ?? {}) : (rI?.value ?? r?.value ?? {});
      out.push({ key: k, value: v, missingInDb: !r });
      byKey.delete(k);
    }
    const extras = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
    for (const r of extras) {
      const rI = byKeyI18n.get(r.key);
      const v = editLang === "zh" ? r.value : (rI?.value ?? r.value);
      out.push({ key: r.key, value: v, missingInDb: false });
    }
    return out;
  }, [rows, i18nRows, editLang]);

  const openEdit = (key: string, value: unknown) => {
    setDialogKey(key);
    setDialogValue(value ?? {});
    setDialogOpen(true);
  };

  const persistRow = async (key: string, value: unknown) => {
    if (editLang === "zh") {
      const r = await apiJson<{ key: string; value: any }>(`/api/admin/site-settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setRows((prev) => {
        const idx = prev.findIndex((x) => x.key === r.key);
        if (idx >= 0) return prev.map((x) => (x.key === r.key ? r : x));
        return [...prev, r].sort((a, b) => a.key.localeCompare(b.key));
      });
    } else {
      const r = await apiJson<{ key: string; value: any }>(
        `/api/admin/site-settings-i18n/${encodeURIComponent(key)}?lang=${encodeURIComponent(editLang)}`,
        {
          method: "PUT",
          body: JSON.stringify({ value }),
        },
      );
      setI18nRows((prev) => {
        const idx = prev.findIndex((x) => x.key === r.key);
        if (idx >= 0) return prev.map((x) => (x.key === r.key ? { key: r.key, value: r.value } : x));
        return [...prev, { key: r.key, value: r.value }].sort((a, b) => a.key.localeCompare(b.key));
      });
    }
    alert("已保存");
  };

  const saveAdvanced = async () => {
    const k = advKey.trim();
    if (!k) {
      alert("请填写配置 key");
      return;
    }
    try {
      const value = JSON.parse(advJson);
      await persistRow(k, value);
      setAdvOpen(false);
      setAdvKey("");
      setAdvJson("{}");
    } catch (e: any) {
      alert(`保存失败：${e?.message || "JSON 无效"}`);
    }
  };

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;
  if (err) return <div className="text-sm text-red-600">加载失败：{err}</div>;

  return (
    <div className="space-y-6">
      <SiteSettingEditDialog
        open={dialogOpen}
        settingKey={dialogKey}
        value={dialogValue}
        onClose={() => setDialogOpen(false)}
        onSave={async (next) => {
          await persistRow(dialogKey, next);
        }}
      />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-industrial-blue">站点配置</div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">编辑语言</div>
            <select
              value={editLang}
              onChange={(e) => setEditLang(e.target.value as Lang)}
              className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1"
            >
              {SUPPORTED_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={batchBusy || editLang === "zh"}
                onClick={() => void runBatch("empty")}
                className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 disabled:opacity-50"
                title="为当前语言生成空翻译记录（不覆盖已有）"
              >
                生成空翻译
              </button>
              <button
                type="button"
                disabled={batchBusy || editLang === "zh"}
                onClick={() => void runBatch("copyZh")}
                className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 disabled:opacity-50"
                title="把中文内容复制到当前语言（不覆盖已有）"
              >
                复制中文
              </button>
              <button
                type="button"
                disabled={batchBusy || editLang === "zh"}
                onClick={() => void runBatch("machine")}
                className="text-xs px-2 py-1 rounded-lg bg-industrial-blue text-white font-bold hover:bg-heat-accent hover:text-industrial-blue disabled:opacity-50"
                title="调用 DeepSeek 机器翻译预填（不覆盖已有）"
              >
                机器翻译
              </button>
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          <p>
            点击条目打开表单编辑。<strong className="text-gray-700">「关于我们」</strong>
            对应配置项 <span className="font-mono text-industrial-blue/90">about.page</span>
            （Hero 背景视频 + 标题 + 公司简介正文）；若显示「待首次保存」，点进去填好保存即可写入数据库。
          </p>
          <p>未列在固定表单内的 key（如 shipping.meta）请用「高级 · JSON」新建或编辑。</p>
        </div>
      </div>

      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-gray-500 uppercase">配置列表</span>
          <button
            type="button"
            onClick={() => {
              setAdvKey("");
              setAdvJson("{}");
              setAdvOpen(true);
            }}
            className="text-xs font-bold text-industrial-blue hover:underline"
          >
            + 高级 · JSON 新建
          </button>
        </div>
        <div className="divide-y max-h-[min(70vh,520px)] overflow-y-auto">
          {displayRows.map((r) => (
            <div key={r.key} className="flex items-stretch gap-0">
              <button
                type="button"
                onClick={() => openEdit(r.key, r.value)}
                className="flex-1 text-left px-4 py-3 hover:bg-gray-50 min-w-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-gray-800">{SITE_SETTING_LIST_LABEL[r.key] ?? r.key}</span>
                  <span className="font-mono text-[11px] text-industrial-blue/80">{r.key}</span>
                  {hasStructuredSiteSettingForm(r.key) ? (
                    <span className="text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">表单</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">JSON</span>
                  )}
                  {r.missingInDb ? (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">待首次保存</span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-400 truncate mt-0.5">
                  {r.missingInDb ? "（尚无数据库记录，点编辑填写后保存即可）" : JSON.stringify(r.value ?? {})}
                </div>
              </button>
              <button
                type="button"
                title="编辑"
                onClick={() => openEdit(r.key, r.value)}
                className="shrink-0 px-3 border-l border-gray-100 text-gray-400 hover:bg-gray-50 hover:text-industrial-blue"
              >
                <Pencil size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {advOpen && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && setAdvOpen(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full border border-gray-100 shadow-xl p-4 space-y-3" onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold text-industrial-blue">高级 · JSON 保存</div>
            <p className="text-xs text-gray-500">用于 `shipping.meta` 等扩展 key，或临时覆盖任意配置。</p>
            <input
              value={advKey}
              onChange={(e) => setAdvKey(e.target.value)}
              placeholder="配置 key"
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-industrial-blue"
            />
            <textarea
              value={advJson}
              onChange={(e) => setAdvJson(e.target.value)}
              className="w-full h-48 font-mono text-xs border border-gray-200 rounded-xl p-3 outline-none focus:ring-1 focus:ring-industrial-blue"
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded-xl border text-sm font-bold text-gray-600" onClick={() => setAdvOpen(false)}>
                取消
              </button>
              <button type="button" className="px-3 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold" onClick={() => void saveAdvanced()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminProductsTab() {
  type Row = any;
  const [rows, setRows] = useState<Row[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [subcats, setSubcats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editLang, setEditLang] = useState<Lang>("zh");
  const [batchBusy, setBatchBusy] = useState(false);

  const runBatch = async (
    entity: "products" | "categories" | "subcategories",
    mode: "empty" | "copyZh" | "machine",
  ) => {
    if (editLang === "zh") {
      alert("请切换到非中文语言后再批量生成翻译");
      return;
    }
    if (batchBusy) return;
    const ok = confirm(`将批量处理 ${entity}：${mode}（目标语言 ${editLang.toUpperCase()}）。继续？`);
    if (!ok) return;
    setBatchBusy(true);
    try {
      const r = await apiJson<any>("/api/admin/i18n/batch", {
        method: "POST",
        body: JSON.stringify({ entity, lang: editLang, mode }),
      });
      alert(`批量完成：创建 ${r.created}，更新 ${r.updated}，跳过 ${r.skipped}，失败 ${r.failures?.length || 0}`);
    } catch (e: any) {
      alert(e?.message || "批量失败");
    } finally {
      setBatchBusy(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [c, p] = await Promise.all([
        apiJson<any[]>("/api/admin/categories"),
        apiJson<Row[]>("/api/admin/products"),
      ]);
      setCats(c);
      setSubcats(c.flatMap((x) => x.subcats || []));
      setRows(p);
    } catch (e: any) {
      setLoadErr(e?.message || "加载失败（请确认已登录且 API 可访问）");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert("请输入分类名称");
      return;
    }
    setAddingCat(true);
    try {
      await apiJson("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name, enabled: true, sortOrder: cats.length }),
      });
      setNewCategoryName("");
      await loadAll();
    } catch (e: any) {
      alert(e?.message || "创建分类失败（名称可能已存在）");
    } finally {
      setAddingCat(false);
    }
  };

  const save = async (data: any) => {
    if (!data.categoryId) {
      alert("请先选择或创建一个产品分类");
      return;
    }
    try {
      if (data.id) {
        const r = await apiJson(`/api/admin/products/${data.id}`, { method: "PUT", body: JSON.stringify(data) });
        setRows((prev) => prev.map((x) => (x.id === (r as any).id ? r : x)));
      } else {
        const r = await apiJson(`/api/admin/products`, { method: "POST", body: JSON.stringify(data) });
        setRows((prev) => [r as any, ...prev]);
      }
      setEditing(null);
    } catch (e: any) {
      alert(e?.message || "保存失败");
    }
  };

  const del = async (id: string) => {
    if (!confirm("确定删除该产品？")) return;
    await apiJson(`/api/admin/products/${id}`, { method: "DELETE" });
    setRows((prev) => prev.filter((x) => x.id !== id));
  };

  const uploadCover = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const token = localStorage.getItem("admin_token");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${API_BASE}/api/admin/upload`, {
      method: "POST",
      credentials: "include",
      headers,
      body: fd,
    });
    if (!r.ok) {
      let msg = "上传失败";
      try {
        const j = await r.json();
        msg = j?.message || msg;
      } catch {
        // ignore
      }
      throw new Error(msg);
    }
    return (await r.json()) as { url: string };
  };

  const Editor = ({ row }: { row: Row }) => {
    const [draft, setDraft] = useState<any>(() => ({
      id: row?.id,
      name: row?.name || "",
      categoryId: row?.categoryId || cats?.[0]?.id || "",
      subcategoryId: row?.subcategoryId || null,
      priceUsd: row?.priceUsd ?? "0",
      enabled: row?.enabled ?? true,
      imageCoverUrl: row?.imageCoverUrl || "",
      specs: row?.specs ?? [],
      description: row?.description ?? "",
      lengthCm: row?.lengthCm ?? null,
      widthCm: row?.widthCm ?? null,
      heightCm: row?.heightCm ?? null,
      cbmPerUnit: row?.cbmPerUnit ?? null,
    }));
    const [i18nDraft, setI18nDraft] = useState<any | null>(null);
    const [i18nJson, setI18nJson] = useState<string>("[]");
    const [i18nLoading, setI18nLoading] = useState(false);

    useEffect(() => {
      if (!draft.id || editLang === "zh") {
        setI18nDraft(null);
        setI18nJson("[]");
        return;
      }
      setI18nLoading(true);
      apiJson<any>(`/api/admin/products/${encodeURIComponent(draft.id)}/i18n?lang=${encodeURIComponent(editLang)}`)
        .then((r) => {
          const base = { name: draft.name, description: draft.description, specs: draft.specs ?? [] };
          const v = r || base;
          setI18nDraft({ name: v.name || base.name, description: v.description || base.description, specs: v.specs ?? base.specs });
          setI18nJson(JSON.stringify(v.specs ?? base.specs, null, 2));
        })
        .catch(() => {
          const base = { name: draft.name, description: draft.description, specs: draft.specs ?? [] };
          setI18nDraft(base);
          setI18nJson(JSON.stringify(base.specs ?? [], null, 2));
        })
        .finally(() => setI18nLoading(false));
    }, [draft.id, editLang]);

    const saveI18n = async () => {
      if (!draft.id) return;
      if (!i18nDraft) return;
      let specs: any = [];
      try {
        specs = JSON.parse(i18nJson || "[]");
      } catch (e: any) {
        alert(`规格 JSON 无效：${e?.message || "解析失败"}`);
        return;
      }
      await apiJson(`/api/admin/products/${encodeURIComponent(draft.id)}/i18n?lang=${encodeURIComponent(editLang)}`, {
        method: "PUT",
        body: JSON.stringify({ name: i18nDraft.name, description: i18nDraft.description, specs }),
      });
      alert("已保存该语言翻译");
    };

    const filteredSubcats = useMemo(() => subcats.filter((s) => s.categoryId === draft.categoryId), [subcats, draft.categoryId]);

    return (
      <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
        <div className="relative bg-white rounded-3xl w-full max-w-3xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-xl font-bold text-industrial-blue">{draft.id ? "编辑产品" : "新增产品"}</div>
            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-industrial-blue"><X size={22} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">名称</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">价格（USD）</label>
                <input value={draft.priceUsd} onChange={(e) => setDraft({ ...draft, priceUsd: e.target.value })} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                  上架
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">分类</label>
              <select
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value, subcategoryId: null })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
              >
                {cats.length === 0 ? (
                  <option value="">（暂无分类，请关闭弹窗后在下方创建）</option>
                ) : (
                  <>
                    <option value="" disabled>
                      请选择分类
                    </option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">子分类</label>
              <select value={draft.subcategoryId || ""} onChange={(e) => setDraft({ ...draft, subcategoryId: e.target.value || null })} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm">
                <option value="">（无）</option>
                {filteredSubcats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">封面图</label>
              <div className="flex flex-col md:flex-row gap-3 items-center">
                <input value={draft.imageCoverUrl} onChange={(e) => setDraft({ ...draft, imageCoverUrl: e.target.value })} className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="图片 URL 或通过右侧上传" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const up = await uploadCover(f);
                      setDraft({ ...draft, imageCoverUrl: up.url });
                    } catch (err: any) {
                      alert(err?.message || "上传失败");
                    }
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">规格（每行一条）</label>
              <textarea
                value={(Array.isArray(draft.specs) ? draft.specs : []).join("\n")}
                onChange={(e) => setDraft({ ...draft, specs: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm h-24"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">描述</label>
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="w-full border border-gray-200 rounded-xl p-3 text-sm h-28" />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs font-bold text-gray-400 uppercase mb-2">尺寸/体积（用于 CBM 运费）</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <input placeholder="长(cm)" value={draft.lengthCm ?? ""} onChange={(e) => setDraft({ ...draft, lengthCm: e.target.value ? Number(e.target.value) : null })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input placeholder="宽(cm)" value={draft.widthCm ?? ""} onChange={(e) => setDraft({ ...draft, widthCm: e.target.value ? Number(e.target.value) : null })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input placeholder="高(cm)" value={draft.heightCm ?? ""} onChange={(e) => setDraft({ ...draft, heightCm: e.target.value ? Number(e.target.value) : null })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input placeholder="或 CBM/件" value={draft.cbmPerUnit ?? ""} onChange={(e) => setDraft({ ...draft, cbmPerUnit: e.target.value ? e.target.value : null })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2" />
              </div>
              <div className="text-[11px] text-gray-400 mt-2">优先使用 “CBM/件”；如为空则用长宽高自动换算 \(cm³ → m³\)。</div>
            </div>
          </div>
          {draft.id && editLang !== "zh" && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-bold text-industrial-blue">翻译（{editLang.toUpperCase()}）</div>
                <div className="text-xs text-gray-500">缺失将回退到中文</div>
              </div>
              {i18nLoading ? (
                <div className="text-sm text-gray-500">加载翻译中…</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">名称</label>
                    <input
                      value={i18nDraft?.name || ""}
                      onChange={(e) => setI18nDraft((p: any) => ({ ...(p || {}), name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">描述</label>
                    <textarea
                      value={i18nDraft?.description || ""}
                      onChange={(e) => setI18nDraft((p: any) => ({ ...(p || {}), description: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm h-24"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">规格（JSON 数组）</label>
                    <textarea
                      value={i18nJson}
                      onChange={(e) => setI18nJson(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 font-mono text-xs h-32"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditing(null)} className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">取消</button>
            {editLang === "zh" ? (
              <button onClick={() => save(draft)} className="px-4 py-3 rounded-xl bg-industrial-blue text-white font-bold hover:bg-heat-accent hover:text-industrial-blue transition-colors">保存</button>
            ) : (
              <button
                onClick={() => void saveI18n()}
                disabled={!draft.id || i18nLoading}
                className="px-4 py-3 rounded-xl bg-industrial-blue text-white font-bold hover:bg-heat-accent hover:text-industrial-blue transition-colors disabled:opacity-60"
              >
                保存翻译
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;

  return (
    <div className="space-y-4">
      {loadErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 text-red-800 text-sm p-4">
          {loadErr}
        </div>
      )}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
        <div className="text-xs font-bold text-gray-500 uppercase">分类维护</div>
        <p className="text-sm text-gray-600">
          新增产品前需至少有一个分类。若下拉为空，请先在此添加（与「站点配置」无关）。
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">新分类名称</label>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="例如：石膏板"
              className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm"
              onKeyDown={(e) => e.key === "Enter" && void addCategory()}
            />
          </div>
          <button
            type="button"
            disabled={addingCat}
            onClick={() => void addCategory()}
            className="px-4 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold hover:bg-heat-accent hover:text-industrial-blue disabled:opacity-60"
          >
            {addingCat ? "添加中…" : "添加分类"}
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">产品表格（增删改查 + 上传图片 + 尺寸/CBM）。封面图上传走 API 服务器地址。</div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={batchBusy || editLang === "zh"}
            onClick={() => void runBatch("categories", "machine")}
            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 disabled:opacity-60"
            title="分类：机器翻译到当前语言（不覆盖已有）"
          >
            分类翻译
          </button>
          <button
            type="button"
            disabled={batchBusy || editLang === "zh"}
            onClick={() => void runBatch("products", "machine")}
            className="px-3 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold hover:bg-heat-accent hover:text-industrial-blue disabled:opacity-60"
            title="产品：机器翻译到当前语言（不覆盖已有）"
          >
            产品翻译
          </button>
          <select
            value={editLang}
            onChange={(e) => setEditLang(e.target.value as Lang)}
            className="px-2 py-2 rounded-xl border border-gray-200 text-sm bg-white"
            title="编辑语言（非中文时，编辑的是翻译表）"
          >
            {SUPPORTED_LANGS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void loadAll()} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200">刷新</button>
          <button type="button" onClick={() => setEditing({})} className="px-3 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold hover:bg-heat-accent hover:text-industrial-blue">新增产品</button>
        </div>
      </div>

      <div className="overflow-auto border border-gray-100 rounded-2xl">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-3">名称</th>
              <th className="text-left p-3">分类</th>
              <th className="text-left p-3">价格(USD)</th>
              <th className="text-left p-3">上架</th>
              <th className="text-left p-3">CBM</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="p-3 font-bold text-industrial-blue">{r.name}</td>
                <td className="p-3 text-gray-600">{r.category?.name || ""}{r.subcategory ? ` / ${r.subcategory.name}` : ""}</td>
                <td className="p-3">${Number(r.priceUsd).toFixed(2)}</td>
                <td className="p-3">{r.enabled ? "是" : "否"}</td>
                <td className="p-3">{r.cbmPerUnit ? Number(r.cbmPerUnit).toFixed(4) : "-"}</td>
                <td className="p-3 flex gap-2">
                  <button onClick={() => setEditing(r)} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold">编辑</button>
                  <button onClick={() => del(r.id)} className="px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <Editor row={editing} />}
    </div>
  );
}

function AdminPortsTab() {
  const [countries, setCountries] = useState<any[]>([]);
  const [ports, setPorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editLang, setEditLang] = useState<Lang>("zh");
  const [batchBusy, setBatchBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [cs, ps] = await Promise.all([apiJson<any[]>("/api/public/countries"), apiJson<any[]>("/api/admin/ports")]);
    setCountries(cs);
    setPorts(ps);
    setLoading(false);
  };
  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const runBatch = async (entity: "countries" | "ports", mode: "empty" | "copyZh" | "machine") => {
    if (editLang === "zh") {
      alert("请切换到非中文语言后再批量生成翻译");
      return;
    }
    if (batchBusy) return;
    const ok = confirm(`将批量处理 ${entity}：${mode}（目标语言 ${editLang.toUpperCase()}）。继续？`);
    if (!ok) return;
    setBatchBusy(true);
    try {
      const r = await apiJson<any>("/api/admin/i18n/batch", {
        method: "POST",
        body: JSON.stringify({ entity, lang: editLang, mode }),
      });
      await load();
      alert(`批量完成：创建 ${r.created}，更新 ${r.updated}，跳过 ${r.skipped}，失败 ${r.failures?.length || 0}`);
    } catch (e: any) {
      alert(e?.message || "批量失败");
    } finally {
      setBatchBusy(false);
    }
  };

  const createCountry = async () => {
    const name = prompt("国家名称");
    if (!name) return;
    await apiJson("/api/admin/countries", { method: "POST", body: JSON.stringify({ name, enabled: true }) });
    load();
  };
  const createPort = async () => {
    const countryId = countries[0]?.id;
    if (!countryId) return alert("请先新增国家");
    const name = prompt("港口名称");
    if (!name) return;
    await apiJson("/api/admin/ports", { method: "POST", body: JSON.stringify({ name, countryId, enabled: true }) });
    load();
  };
  const delPort = async (id: string) => {
    if (!confirm("删除该港口？")) return;
    await apiJson(`/api/admin/ports/${id}`, { method: "DELETE" });
    setPorts((p) => p.filter((x) => x.id !== id));
  };

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">维护国家与港口（用于购物车二级联动）。</div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={batchBusy || editLang === "zh"}
            onClick={() => void runBatch("countries", "machine")}
            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 disabled:opacity-60"
            title="国家：机器翻译到当前语言（不覆盖已有）"
          >
            国家翻译
          </button>
          <button
            type="button"
            disabled={batchBusy || editLang === "zh"}
            onClick={() => void runBatch("ports", "machine")}
            className="px-3 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold hover:bg-heat-accent hover:text-industrial-blue disabled:opacity-60"
            title="港口：机器翻译到当前语言（不覆盖已有）"
          >
            港口翻译
          </button>
          <select
            value={editLang}
            onChange={(e) => setEditLang(e.target.value as Lang)}
            className="px-2 py-2 rounded-xl border border-gray-200 text-sm bg-white"
            title="编辑语言（非中文时，编辑的是翻译表）"
          >
            {SUPPORTED_LANGS.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
          <button onClick={load} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200">刷新</button>
          <button onClick={createCountry} className="px-3 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold hover:bg-heat-accent hover:text-industrial-blue">新增国家</button>
          <button onClick={createPort} className="px-3 py-2 rounded-xl bg-industrial-blue text-white text-sm font-bold hover:bg-heat-accent hover:text-industrial-blue">新增港口</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">国家</div>
          <div className="divide-y">
            {countries.map((c) => (
              <div key={c.id} className="px-4 py-3 flex justify-between items-center">
                <div className="font-bold text-industrial-blue">{c.name}</div>
                <div className="flex items-center gap-2">
                  {editLang !== "zh" ? (
                    <button
                      className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
                      onClick={async () => {
                        const name = prompt(`国家名称翻译（${editLang.toUpperCase()}）`, "");
                        if (!name) return;
                        await apiJson(`/api/admin/countries/${encodeURIComponent(c.id)}/i18n?lang=${encodeURIComponent(editLang)}`, {
                          method: "PUT",
                          body: JSON.stringify({ name }),
                        });
                        alert("已保存翻译");
                      }}
                    >
                      翻译
                    </button>
                  ) : null}
                  <div className="text-xs text-gray-400">{c.enabled ? "启用" : "禁用"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">港口</div>
          <div className="divide-y">
            {ports.map((p) => (
              <div key={p.id} className="px-4 py-3 flex justify-between items-center gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-industrial-blue truncate">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.country?.name}</div>
                </div>
                <div className="flex gap-2">
                  {editLang !== "zh" ? (
                    <button
                      className="px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs"
                      onClick={async () => {
                        const name = prompt(`港口名称翻译（${editLang.toUpperCase()}）`, "");
                        if (!name) return;
                        await apiJson(`/api/admin/ports/${encodeURIComponent(p.id)}/i18n?lang=${encodeURIComponent(editLang)}`, {
                          method: "PUT",
                          body: JSON.stringify({ name }),
                        });
                        alert("已保存翻译");
                      }}
                    >
                      翻译
                    </button>
                  ) : null}
                  <button onClick={() => delPort(p.id)} className="px-3 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs">
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPricingTab() {
  const [ports, setPorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [usdPerCbm, setUsdPerCbm] = useState<string>("0");
  const [minBillableCbm, setMinBillableCbm] = useState<string>("");
  const [fixedFees, setFixedFees] = useState<string>("[]");

  const load = async () => {
    setLoading(true);
    const ps = await apiJson<any[]>("/api/admin/ports");
    setPorts(ps);
    setLoading(false);
  };
  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const pick = (p: any) => {
    setActive(p);
    setUsdPerCbm(p.pricing?.usdPerCbm ?? "0");
    setMinBillableCbm(p.pricing?.minBillableCbm ?? "");
    setFixedFees(JSON.stringify(p.pricing?.fixedFees ?? [], null, 2));
  };

  const save = async () => {
    if (!active) return;
    const ff = JSON.parse(fixedFees || "[]");
    await apiJson(`/api/admin/pricing-rules/${active.id}`, {
      method: "PUT",
      body: JSON.stringify({
        usdPerCbm,
        minBillableCbm: minBillableCbm ? minBillableCbm : null,
        fixedFees: ff,
      }),
    });
    alert("已保存");
    load();
  };

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">选择港口</div>
        <div className="divide-y max-h-[520px] overflow-auto">
          {ports.map((p) => (
            <button key={p.id} onClick={() => pick(p)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${active?.id === p.id ? "bg-gray-50" : ""}`}>
              <div className="font-bold text-industrial-blue">{p.name}</div>
              <div className="text-xs text-gray-400">{p.country?.name}</div>
              <div className="text-xs text-gray-400">$/CBM: {p.pricing?.usdPerCbm ?? "-"}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">编辑费率</div>
        <div className="p-4 space-y-3">
          {!active ? (
            <div className="text-sm text-gray-500">先在左侧选择一个港口。</div>
          ) : (
            <>
              <div className="text-sm font-bold text-industrial-blue">{active.name}（{active.country?.name}）</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">$/CBM</label>
                  <input value={usdPerCbm} onChange={(e) => setUsdPerCbm(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">最低计费 CBM（可空）</label>
                  <input value={minBillableCbm} onChange={(e) => setMinBillableCbm(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">固定附加费（JSON 数组）</label>
                <textarea value={fixedFees} onChange={(e) => setFixedFees(e.target.value)} className="w-full h-56 font-mono text-xs border border-gray-200 rounded-xl p-3" />
                <div className="text-[11px] text-gray-400 mt-2">
                  {'格式示例：[{"name":"文件费","amountUsd":50}]'}
                </div>
              </div>
              <button onClick={save} className="px-4 py-3 rounded-xl bg-industrial-blue text-white font-bold hover:bg-heat-accent hover:text-industrial-blue transition-colors">
                保存
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminOrdersTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<any[]>("/api/admin/orders")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">订单列表</div>
        <div className="divide-y max-h-[520px] overflow-auto">
          {rows.map((o) => (
            <button key={o.id} onClick={() => setActive(o)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${active?.id === o.id ? "bg-gray-50" : ""}`}>
              <div className="flex justify-between items-center">
                <div className="font-mono text-xs text-gray-500">{o.id}</div>
                <div className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-sm font-bold text-industrial-blue mt-1">${Number(o.totalUsd).toFixed(2)} / CBM {Number(o.totalCbm).toFixed(4)}</div>
              <div className="text-xs text-gray-400">{o.contactEmail} / {o.contactSocial}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">订单详情</div>
        <div className="p-4">
          {!active ? (
            <div className="text-sm text-gray-500">选择一条订单查看详情。</div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-bold text-industrial-blue">总计：${Number(active.totalUsd).toFixed(2)}</div>
              <div className="text-xs text-gray-500">目的港：{active.port?.country?.name} / {active.port?.name}</div>
              <div className="text-xs text-gray-500">采购方式：{active.procurementMethod}</div>
              <div className="text-xs text-gray-500">邮箱：{active.contactEmail}</div>
              <div className="text-xs text-gray-500">社交：{active.contactSocial}</div>
              <div className="text-xs text-gray-500">IP：{active.ip || "-"}</div>
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500 uppercase">清单</div>
                <div className="divide-y">
                  {(active.items || []).map((it: any) => (
                    <div key={it.id} className="px-3 py-2 flex justify-between text-xs">
                      <div className="text-gray-700">{it.product?.name} x {it.qty}</div>
                      <div className="font-bold text-industrial-blue">${Number(it.lineTotalUsd).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-xs text-gray-500">运费：${Number(active.freightUsd).toFixed(2)}</div>
              <div className="text-xs text-gray-500">附加费：{JSON.stringify(active.fixedFees || [])}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminAiTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson<any[]>("/api/admin/ai-conversations")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-gray-500">加载中...</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">会话列表</div>
        <div className="divide-y max-h-[520px] overflow-auto">
          {rows.map((c) => (
            <button key={c.id} onClick={() => setActive(c)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${active?.id === c.id ? "bg-gray-50" : ""}`}>
              <div className="flex justify-between items-center">
                <div className="font-mono text-xs text-gray-500">{c.id}</div>
                <div className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-sm font-bold text-industrial-blue mt-1">{c.summary || "（无摘要）"}</div>
              <div className="text-xs text-gray-400">IP：{c.ip || "-"}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500 uppercase">会话详情</div>
        <div className="p-4 space-y-3 max-h-[520px] overflow-auto">
          {!active ? (
            <div className="text-sm text-gray-500">选择一个会话查看消息。</div>
          ) : (
            (active.messages || []).map((m: any) => (
              <div key={m.id} className={`p-3 rounded-2xl ${m.role === "user" ? "bg-gray-50" : "bg-industrial-blue/5"}`}>
                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">{m.role}</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{m.content}</div>
                {m.product && <div className="text-xs text-heat-accent mt-2">命中产品：{m.product.name}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const ContactModal = ({
  isOpen,
  onClose,
  contact,
}: {
  isOpen: boolean;
  onClose: () => void;
  contact?: { phone?: string; email?: string; whatsapp?: string };
}) => {
  const { t } = useTranslation("common");
  const phone = contact?.phone ?? "+86 21 5888 8888";
  const email = contact?.email ?? "info@qingtai-materials.com";
  const wa = contact?.whatsapp ?? "+86 138 0000 0000";
  return (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full"
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-industrial-blue"><X size={24} /></button>
          <h3 className="text-2xl font-display font-bold text-industrial-blue mb-6">{t("contactModal.title")}</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
              <Phone className="text-heat-accent" size={20} />
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold">{t("contactModal.phone")}</div>
                <div className="font-bold text-industrial-blue">{phone}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
              <Mail className="text-heat-accent" size={20} />
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold">{t("contactModal.email")}</div>
                <div className="font-bold text-industrial-blue">{email}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
              <div className="w-5 h-5 flex items-center justify-center text-heat-accent font-bold">W</div>
              <div>
                <div className="text-[10px] text-gray-400 uppercase font-bold">{t("contactModal.whatsapp")}</div>
                <div className="font-bold text-industrial-blue">{wa}</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
  );
};

const SidebarSocial = ({ onShowContact }: { onShowContact: () => void }) => (
  <div className="fixed left-6 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col gap-6">
    <div className="w-[1px] h-20 bg-gray-300 mx-auto"></div>
    <button onClick={onShowContact} className="text-gray-400 hover:text-industrial-blue transition-colors"><Facebook size={20} /></button>
    <button onClick={onShowContact} className="text-gray-400 hover:text-industrial-blue transition-colors"><Twitter size={20} /></button>
    <button onClick={onShowContact} className="text-gray-400 hover:text-industrial-blue transition-colors"><Linkedin size={20} /></button>
    <button onClick={onShowContact} className="text-gray-400 hover:text-industrial-blue transition-colors"><Instagram size={20} /></button>
    <div className="w-[1px] h-20 bg-gray-300 mx-auto"></div>
  </div>
);

const Footer = ({
  onShowContact,
  footerCfg,
}: {
  onShowContact: () => void;
  footerCfg?: Record<string, unknown>;
}) => {
  const { t } = useTranslation("common");
  const [email, setEmail] = useState("");
  const handleSend = () => {
    setEmail("");
    alert(t("footer.sentAlert"));
  };
  const tagline = String(
    footerCfg?.tagline ?? t("footer.defaults.tagline")
  );
  const address = String(
    footerCfg?.address ?? t("footer.defaults.address")
  );
  const phone = String(footerCfg?.phone ?? "+86 21 5888 8888");
  const mail = String(footerCfg?.email ?? "info@qingtai-materials.com");
  const copyright = String(
    footerCfg?.copyright ?? t("footer.defaults.copyright")
  );
  const quickLinks = (Array.isArray(footerCfg?.quickLinks) ? footerCfg!.quickLinks : []) as Array<{
    label?: string;
    href?: string;
  }>;
  const defaultQuick = [
    { label: t("footer.linkAlibaba"), href: "https://qingtai.en.alibaba.com" },
    { label: t("footer.linkOfficial"), href: "#" },
    { label: t("footer.linkMic"), href: "https://qingtai.made-in-china.com" },
  ];
  const ql = quickLinks.length ? quickLinks : defaultQuick;
  const legalLinks = (Array.isArray(footerCfg?.legalLinks) ? footerCfg!.legalLinks : []) as Array<{
    label?: string;
    href?: string;
  }>;
  const defaultLegal = [
    { label: t("footer.privacy"), href: "#" },
    { label: t("footer.terms"), href: "#" },
    { label: t("footer.cookies"), href: "#" },
  ];
  const ll = legalLinks.length ? legalLinks : defaultLegal;
  const newsletterTitle = String(footerCfg?.newsletterTitle ?? t("footer.newsletterTitle"));
  const newsletterDesc = String(
    footerCfg?.newsletterDesc ?? t("footer.newsletterDesc")
  );

  return (
    <footer className="bg-industrial-blue text-white pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-white flex items-center justify-center text-industrial-blue font-bold text-xl">Q</div>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-display font-extrabold tracking-tighter text-white">青泰建材</span>
              <span className="text-[10px] tracking-[0.2em] text-gray-400 uppercase">Qingtai Materials</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            {tagline}
          </p>
          <div className="flex gap-4">
            <button onClick={onShowContact} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"><Facebook size={18} /></button>
            <button onClick={onShowContact} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"><Instagram size={18} /></button>
            <button onClick={onShowContact} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"><Linkedin size={18} /></button>
          </div>
        </div>

        <div>
          <h4 className="font-display font-bold text-lg mb-6">{t("footer.quickLinksTitle")}</h4>
          <ul className="space-y-4 text-gray-400 text-sm">
            {ql.map((l, i) => (
              <li key={i}>
                <a
                  href={l.href || "#"}
                  target={l.href?.startsWith("http") ? "_blank" : undefined}
                  rel={l.href?.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="hover:text-heat-accent transition-colors"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display font-bold text-lg mb-6">{t("footer.contactTitle")}</h4>
          <ul className="space-y-4 text-gray-400 text-sm">
            <li className="flex items-start gap-3">
              <MapPin size={18} className="text-heat-accent shrink-0" />
              <span>{address}</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone size={18} className="text-heat-accent shrink-0" />
              <span>{phone}</span>
            </li>
            <li className="flex items-center gap-3">
              <Mail size={18} className="text-heat-accent shrink-0" />
              <span>{mail}</span>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-display font-bold text-lg mb-6">{newsletterTitle}</h4>
          <p className="text-gray-400 text-sm mb-4">{newsletterDesc}</p>
          <div className="flex">
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("footer.emailPlaceholder")} 
              className="bg-white/5 border border-white/10 px-4 py-2 text-sm focus:ring-1 focus:ring-heat-accent outline-none w-full" 
            />
            <button onClick={handleSend} className="bg-heat-accent text-industrial-blue px-4 py-2 font-bold hover:bg-white transition-colors whitespace-nowrap">{t("footer.send")}</button>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500">
        <p>{copyright}</p>
        <div className="flex gap-6">
          {ll.map((l, i) => (
            <a key={i} href={l.href || "#"} className="hover:text-white transition-colors">
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
};

// --- Page Views ---

const HomePage = ({
  setPage,
  onShowAIChat,
  setActiveSystem,
  setActiveProject,
  publicSite = {},
}: {
  setPage: (p: Page) => void;
  onShowAIChat: () => void;
  setActiveSystem: (s: System) => void;
  setActiveProject: (p: Project) => void;
  publicSite?: Record<string, unknown>;
}) => {
  const { t, i18n } = useTranslation("common");
  const fallbackSystems = useMemo(() => getLocalizedSystems(t), [t, i18n.language]);
  const fallbackProjects = useMemo(() => getLocalizedProjects(t), [t, i18n.language]);
  const consultation = (publicSite["home.consultation"] || {}) as Record<string, unknown>;
  const consTitle = String(consultation.title ?? t("home.consultation.title"));
  const consDesc = String(
    consultation.description ??
      t("home.consultation.desc")
  );
  const hotlineLabel = String(consultation.hotlineLabel ?? t("home.consultation.hotlineLabel"));
  const hotlineValue = String(consultation.hotlineValue ?? t("home.consultation.hotlineValue"));
  const bgOpacity =
    typeof consultation.backgroundOpacity === "number" ? consultation.backgroundOpacity : 0.45;
  const consultationBoxStyle: React.CSSProperties = {
    backgroundColor: `rgba(255, 255, 255, ${bgOpacity})`,
  };
  const systemsRaw = publicSite["home.systems"];
  const systemsList =
    Array.isArray(systemsRaw) && systemsRaw.length > 0 ? (systemsRaw as System[]) : fallbackSystems;
  const projectsRaw = publicSite["home.projects"];
  const projectsList =
    Array.isArray(projectsRaw) && projectsRaw.length > 0 ? (projectsRaw as Project[]) : fallbackProjects;
  const logistics = (publicSite["home.logistics"] || {}) as Record<string, unknown>;
  const logTitle = String(logistics.title ?? t("home.logistics.title"));
  const logDesc = String(
    logistics.description ??
      t("home.logistics.desc")
  );
  const cards = (Array.isArray(logistics.cards) ? logistics.cards : []) as Array<{
    title?: string;
    description?: string;
  }>;
  const card1 = cards[0] || {
    title: t("home.logistics.cards.0.title"),
    description: t("home.logistics.cards.0.desc"),
  };
  const card2 = cards[1] || {
    title: t("home.logistics.cards.1.title"),
    description: t("home.logistics.cards.1.desc"),
  };
  const slideUrls = (() => {
    const urls = logistics.slideImageUrls;
    if (Array.isArray(urls) && urls.length > 0) return urls.map(String).filter(Boolean);
    const seeds = Array.isArray(logistics.slideSeeds) ? logistics.slideSeeds.map(String) : [];
    if (seeds.length > 0) return seeds.map((s) => `https://picsum.photos/seed/${encodeURIComponent(s)}/800/450`);
    return ["logistics1", "logistics2", "logistics3"].map((s) => `https://picsum.photos/seed/${s}/800/450`);
  })();
  const trackTitle = String(logistics.trackTitle ?? t("home.logistics.track.title"));
  const trackOrderId = String(logistics.trackOrderId ?? t("home.logistics.track.orderId"));
  const trackStatus = String(logistics.trackStatus ?? t("home.logistics.track.status"));
  const trackLocation = String(logistics.trackLocation ?? t("home.logistics.track.location"));
  const trackEta = String(logistics.trackEta ?? t("home.logistics.track.eta"));

  return (
  <div className="pt-20">
    {/* Hero Section */}
    <section className="relative h-[90vh] overflow-hidden">
      <div className="absolute inset-0">
        <img 
          src="https://picsum.photos/seed/construction/1920/1080" 
          alt="Construction Site" 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-industrial-blue/60 backdrop-blur-[2px]"></div>
      </div>
      
      <div className="relative max-w-7xl mx-auto px-4 h-full flex items-center">
        <div className="max-w-2xl">
          {/* Language flags (Hero red-box area) */}
          <div className="mb-5">
            <LanguageFlags variant="hero" />
          </div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 bg-heat-accent/20 text-heat-accent px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
          >
            <Zap size={14} /> {t("home.badge")}
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-5xl md:text-7xl font-display font-extrabold text-white leading-[1.1] mb-8"
          >
            {t("home.heroTitleLine1")}<br />
            <span className="text-heat-accent">{t("home.heroTitleAccent")}</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-lg text-gray-300 mb-10 leading-relaxed"
          >
            {t("home.heroDesc1")}
            <br />
            {t("home.heroDesc2")}
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-wrap gap-4"
          >
            <button onClick={() => setPage("catalog")} className="btn-primary text-lg px-8 py-4">
              {t("home.browseCatalog")} <ArrowRight size={20} />
            </button>
            <button onClick={() => setPage("projects")} className="btn-outline border-white text-white hover:bg-white hover:text-industrial-blue text-lg px-8 py-4">
              {t("home.viewProjects")}
            </button>
          </motion.div>
        </div>
      </div>

      {/* Stats Overlay */}
      <div className="absolute bottom-0 right-0 hidden lg:flex bg-white p-10 gap-12 shadow-2xl">
        <div className="flex flex-col">
          <span className="text-4xl font-display font-extrabold text-industrial-blue">20+</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest mt-1">行业经验 (年)</span>
        </div>
        <div className="flex flex-col">
          <span className="text-4xl font-display font-extrabold text-industrial-blue">1200+</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest mt-1">全球项目</span>
        </div>
        <div className="flex flex-col">
          <span className="text-4xl font-display font-extrabold text-industrial-blue">98%</span>
          <span className="text-xs text-gray-500 uppercase tracking-widest mt-1">客户满意度</span>
        </div>
      </div>
    </section>

    {/* Consultation Box */}
    <section className="max-w-7xl mx-auto px-4 -mt-16 relative z-10">
      <div
        style={consultationBoxStyle}
        className="backdrop-blur-xl shadow-2xl p-8 md:p-12 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center border-t-4 border-heat-accent rounded-3xl"
      >
        <div className="lg:col-span-2">
          <h3 className="text-2xl font-display font-bold text-industrial-blue mb-4">{consTitle}</h3>
          <p className="text-gray-500">{consDesc}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 bg-gray-50/50 p-4 flex items-center gap-4 rounded-2xl">
            <div className="w-12 h-12 bg-industrial-blue/10 rounded-full flex items-center justify-center text-industrial-blue">
              <Phone size={24} />
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase font-bold">{hotlineLabel}</div>
              <div className="font-bold text-industrial-blue">{hotlineValue}</div>
            </div>
          </div>
          <button onClick={onShowAIChat} className="btn-primary justify-center rounded-2xl">
            {t("home.consultation.button")}
          </button>
        </div>
      </div>
    </section>

    {/* Core Products Section */}
    <section className="py-24 max-w-7xl mx-auto px-4">
      <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
        <div>
          <div className="accent-border mb-4">
            <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em]">Core Systems</span>
          </div>
          <h2 className="text-4xl font-display font-extrabold text-industrial-blue">{t("home.systems.sectionTitle")}</h2>
        </div>
        <button onClick={() => setPage("catalog")} className="text-industrial-blue font-bold flex items-center gap-2 hover:gap-4 transition-all">
          {t("home.systems.viewAllProducts")} <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {systemsList.map((system) => (
          <div 
            key={system.id} 
            className="group relative h-[500px] overflow-hidden cursor-pointer" 
            onClick={() => { setActiveSystem(system); setPage("systemDetail"); }}
          >
            <img src={system.image} alt={system.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-industrial-blue via-transparent to-transparent opacity-80"></div>
            <div className="absolute bottom-0 left-0 p-8 w-full">
              <span className="text-heat-accent text-xs font-bold tracking-widest uppercase mb-2 block">{t("home.systems.label")}</span>
              <h3 className="text-2xl text-white font-display font-bold mb-4">{system.title}</h3>
              <div className="h-1 w-12 bg-heat-accent transition-all duration-300 group-hover:w-full"></div>
            </div>
          </div>
        ))}
      </div>
    </section>

    {/* Projects Preview Section */}
    <section className="py-24 bg-industrial-blue text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-end mb-16">
          <div>
            <div className="accent-border mb-4">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em]">{t("home.projects.featuredLabel")}</span>
            </div>
            <h2 className="text-4xl font-display font-extrabold">{t("home.projects.sectionTitle")}</h2>
          </div>
          <button onClick={() => setPage("projects")} className="text-heat-accent font-bold flex items-center gap-2">
            {t("home.projects.viewMore")} <ArrowRight size={20} />
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {projectsList.slice(0, 2).map((project) => (
            <div 
              key={project.id} 
              className="group cursor-pointer" 
              onClick={() => { setActiveProject(project); setPage("projectDetail"); }}
            >
              <div className="aspect-video overflow-hidden rounded-2xl mb-6">
                <img src={project.image} alt={project.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
              </div>
              <h3 className="text-2xl font-display font-bold group-hover:text-heat-accent transition-colors">{project.title}</h3>
              <p className="text-gray-400 mt-2">{project.location}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* Logistics Section */}
    <section className="bg-gray-100 py-24">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div>
          <div className="accent-border mb-4">
            <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em]">{t("home.logistics.label")}</span>
          </div>
          <h2 className="text-4xl font-display font-extrabold text-industrial-blue mb-8">{logTitle}</h2>
          <p className="text-gray-600 mb-10 leading-relaxed">{logDesc}</p>
          
          <div className="space-y-6">
            <div className="bg-white p-6 shadow-sm flex items-center gap-6">
              <div className="w-16 h-16 bg-gray-100 flex items-center justify-center text-industrial-blue">
                <Truck size={32} />
              </div>
              <div>
                <h4 className="font-bold text-industrial-blue">{card1.title}</h4>
                <p className="text-sm text-gray-500">{card1.description}</p>
              </div>
            </div>
            <div className="bg-white p-6 shadow-sm flex items-center gap-6">
              <div className="w-16 h-16 bg-gray-100 flex items-center justify-center text-industrial-blue">
                <ShieldCheck size={32} />
              </div>
              <div>
                <h4 className="font-bold text-industrial-blue">{card2.title}</h4>
                <p className="text-sm text-gray-500">{card2.description}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="relative">
          <div className="bg-industrial-blue rounded-2xl p-4 shadow-2xl overflow-hidden aspect-video">
            <motion.div 
              animate={{ x: ["0%", "-100%", "-200%", "0%"] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="flex h-full w-[300%]"
            >
              {slideUrls.map((src, i) => (
                <img 
                  key={`${src}-${i}`}
                  src={src} 
                  alt="" 
                  className="w-1/3 h-full object-cover opacity-60 grayscale"
                />
              ))}
            </motion.div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white/10 backdrop-blur-md p-8 border border-white/20 rounded-xl max-w-sm">
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Package size={20} className="text-heat-accent" /> {trackTitle}
                </h4>
                <div className="space-y-4">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{t("home.logistics.track.orderLabel")} {trackOrderId}</span>
                    <span className="text-heat-accent">{trackStatus}</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-heat-accent w-2/3"></div>
                  </div>
                  <div className="text-xs text-white">
                    <p className="mb-1">{t("home.logistics.track.locationLabel")} {trackLocation}</p>
                    <p className="text-gray-400">{t("home.logistics.track.etaLabel")} {trackEta}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
  );
};

const ProjectsPage = ({
  setPage,
  setActiveProject,
  publicSite = {},
}: {
  setPage: (p: Page) => void;
  setActiveProject: (p: Project) => void;
  publicSite?: Record<string, unknown>;
}) => {
  const { t, i18n } = useTranslation("common");
  const fallbackProjects = useMemo(() => getLocalizedProjects(t), [t, i18n.language]);
  const projectsRaw = publicSite["home.projects"];
  const projectsList =
    Array.isArray(projectsRaw) && projectsRaw.length > 0 ? (projectsRaw as Project[]) : fallbackProjects;
  return (
  <div className="pt-32 pb-24 max-w-7xl mx-auto px-4">
    <div className="accent-border mb-4">
      <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em]">{t("projectsPage.eyebrow")}</span>
    </div>
    <h1 className="text-4xl font-display font-extrabold text-industrial-blue mb-12">{t("projectsPage.title")}</h1>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
      {projectsList.map((project) => (
        <div 
          key={project.id} 
          className="group cursor-pointer" 
          onClick={() => { setActiveProject(project); setPage("projectDetail"); }}
        >
          <div className="aspect-video overflow-hidden rounded-3xl mb-6">
            <img src={project.image} alt={project.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
          </div>
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold text-heat-accent uppercase tracking-widest mb-2">{project.location}</div>
              <h3 className="text-2xl font-display font-bold text-industrial-blue group-hover:text-heat-accent transition-colors">{project.title}</h3>
            </div>
            <ArrowRight className="text-industrial-blue group-hover:translate-x-2 transition-transform" />
          </div>
        </div>
      ))}
    </div>
  </div>
  );
};

const ProjectDetailPage = ({ project }: { project: Project }) => {
  const { t } = useTranslation("common");
  return (
  <div className="pt-32 pb-24 max-w-7xl mx-auto px-4">
    <div className="aspect-[21/9] rounded-3xl overflow-hidden mb-12">
      <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
    </div>
    <div className="max-w-3xl mx-auto">
      <div className="text-sm font-bold text-heat-accent uppercase tracking-widest mb-4">{project.location}</div>
      <h1 className="text-4xl font-display font-extrabold text-industrial-blue mb-8">{project.title}</h1>
      <p className="text-lg text-gray-600 leading-relaxed mb-12">
        {project.description}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-12 border-y border-gray-100">
        <div>
          <div className="text-xs text-gray-400 uppercase font-bold mb-2">{t("projectDetail.contractor")}</div>
          <div className="font-bold text-industrial-blue">{t("projectDetail.contractorValue")}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase font-bold mb-2">{t("projectDetail.materials")}</div>
          <div className="font-bold text-industrial-blue">{t("projectDetail.materialsValue")}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase font-bold mb-2">{t("projectDetail.delivery")}</div>
          <div className="font-bold text-industrial-blue">{t("projectDetail.deliveryValue")}</div>
        </div>
      </div>
    </div>
  </div>
  );
};

const DEFAULT_ABOUT_VIDEO =
  "https://assets.mixkit.co/videos/preview/mixkit-construction-site-with-cranes-and-buildings-4004-large.mp4";

const AboutPage = ({ publicSite = {} }: { publicSite?: Record<string, unknown> }) => {
  const { t } = useTranslation("common");
  const cfg = (publicSite["about.page"] || {}) as Record<string, unknown>;
  const heroTitle = String(cfg.heroTitle ?? t("about.heroTitle"));
  const heroVideoUrl = String(cfg.heroVideoUrl || DEFAULT_ABOUT_VIDEO);
  const profileEyebrow = String(cfg.profileEyebrow ?? t("about.profileEyebrow"));
  const profileHeading = String(cfg.profileHeading ?? t("about.profileHeading"));
  const defaultParas = [
    t("about.profileParagraphs.0"),
    t("about.profileParagraphs.1"),
    t("about.profileParagraphs.2"),
  ];
  const profileParagraphs = Array.isArray(cfg.profileParagraphs)
    ? cfg.profileParagraphs.map(String)
    : defaultParas;

  return (
    <div className="pt-20">
      <section className="h-[60vh] relative overflow-hidden">
        <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
          <source src={heroVideoUrl} type={heroVideoUrl.includes(".webm") ? "video/webm" : "video/mp4"} />
        </video>
        <div className="absolute inset-0 bg-industrial-blue/40 backdrop-blur-sm flex items-center justify-center">
          <h1 className="text-6xl font-display font-extrabold text-white tracking-tighter">{heroTitle}</h1>
        </div>
      </section>

      <section className="py-24 max-w-4xl mx-auto px-4">
        <div className="accent-border mb-8">
          <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em]">{profileEyebrow}</span>
        </div>
        <h2 className="text-4xl font-display font-extrabold text-industrial-blue mb-12">{profileHeading}</h2>
        <div className="space-y-8 text-lg text-gray-600 leading-relaxed">
          {profileParagraphs.map((text, i) => (
            <p key={i}>{text}</p>
          ))}
        </div>
      </section>
    </div>
  );
};

const SystemDetailPage = ({ system }: { system: System }) => {
  const { t } = useTranslation("common");
  return (
  <div className="pt-32 pb-24 max-w-7xl mx-auto px-4">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
      <div className="rounded-3xl overflow-hidden shadow-2xl">
        <img src={system.image} alt={system.title} className="w-full h-full object-cover" />
      </div>
      <div>
        <div className="accent-border mb-4">
          <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.3em]">{t("systemDetail.eyebrow")}</span>
        </div>
        <h1 className="text-5xl font-display font-extrabold text-industrial-blue mb-8">{system.title}</h1>
        <p className="text-xl text-gray-600 leading-relaxed mb-10">
          {system.description}
        </p>
        <div className="space-y-4">
          {system.features.map((feature, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
              <div className="w-8 h-8 bg-heat-accent rounded-full flex items-center justify-center text-industrial-blue font-bold">
                {i + 1}
              </div>
              <span className="font-bold text-industrial-blue">{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  );
};

const AIChatModal = ({
  isOpen,
  onClose,
  setPage,
  onSetActiveProduct,
  onAddToCartWithQty,
}: {
  isOpen: boolean;
  onClose: () => void;
  setPage: (p: Page) => void;
  onSetActiveProduct: (p: Product) => void;
  onAddToCartWithQty: (p: Product, qty: number) => void;
}) => {
  const { t, i18n } = useTranslation("common");
  const welcome = useMemo(
    () => ({
      id: "welcome",
      role: "ai" as const,
      // Always English greeting (per requirement). Replies will follow user's language.
      content:
        "Hi! I’m your Qingtai sales assistant. I can introduce products, estimate quantities, and help you place orders. What do you need?",
    }),
    []
  );

  const [messages, setMessages] = useState<
    { id: string; role: "user" | "ai"; content: string; product?: Product; products?: Product[] }[]
  >([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConversationId(undefined);
      setMessages([welcome]);
      setInput("");
      return;
    }
    setMessages((prev) => {
      if (prev.length === 0) return [welcome];
      const idx = prev.findIndex((m) => m.id === "welcome");
      if (idx >= 0 && prev[idx].role === "ai") {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], content: welcome.content };
        return copy;
      }
      return prev;
    });
  }, [isOpen, welcome]);

  const handleSend = () => {
    if (!input.trim() || sending) return;
    const userMsg = input;
    const userId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setMessages(prev => [...prev, { id: userId, role: "user", content: userMsg }]);
    setInput("");
    setSending(true);

    apiJson<{
      conversationId: string;
      message: { id?: string; content: string };
      product?: ApiProduct | null;
      products?: ApiProduct[] | null;
    }>("/api/public/ai/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId, message: userMsg }),
    })
      .then((r) => {
        setConversationId(r.conversationId);
        const listRaw = Array.isArray(r.products) && r.products.length > 0 ? r.products : r.product ? [r.product] : [];
        const products = listRaw.map(toLegacyProduct);
        const aiId = r.message?.id || `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setMessages((prev) => [
          ...prev,
          {
            id: aiId,
            role: "ai",
            content: r.message.content,
            products: products.length ? products : undefined,
            product: products[0],
          },
        ]);
      })
      .catch((e: any) => {
        const aiId = `a-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setMessages((prev) => [
          ...prev,
          {
            id: aiId,
            role: "ai",
            content: t("ai.chat.requestFailed", { error: e?.message || t("ai.chat.unknownError") }),
          },
        ]);
      })
      .finally(() => setSending(false));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-[100] w-full max-w-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col h-[600px]"
          >
            <div className="bg-industrial-blue p-6 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-heat-accent rounded-full flex items-center justify-center text-industrial-blue">
                  <Zap size={20} />
                </div>
                <div>
                  <div className="font-bold">{t("ai.chat.title")}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-widest">{t("ai.chat.subtitle")}</div>
                </div>
              </div>
              <button onClick={onClose} className="text-white/60 hover:text-white transition-colors"><X size={24} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === "user" ? "bg-industrial-blue text-white rounded-tr-none" : "bg-white text-gray-700 shadow-sm rounded-tl-none"}`}>
                    <p className="text-sm leading-relaxed">
                      {msg.role === "ai" ? <TypewriterText text={msg.content} /> : msg.content}
                    </p>
                    {(msg.products?.length ? msg.products : msg.product ? [msg.product] : []).map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          onSetActiveProduct(p);
                          setPage("detail");
                          onClose();
                        }}
                        className="mt-3 first:mt-4 bg-gray-50 p-3 rounded-xl border border-gray-200 cursor-pointer hover:border-heat-accent transition-colors flex gap-3 items-center"
                      >
                        <img src={p.image} className="w-12 h-12 object-cover rounded-lg shrink-0" alt="" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-industrial-blue truncate">{p.name}</div>
                          <div className="text-[10px] text-gray-400">{t("ai.chat.cardHint")}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCartWithQty(p, 1);
                          }}
                          className="px-2 py-1 text-[10px] font-bold bg-industrial-blue text-white rounded-lg hover:bg-heat-accent hover:text-industrial-blue transition-colors shrink-0"
                        >
                          {t("ai.chat.orderNow")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder={t("ai.chat.inputPlaceholder")} 
                className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
              />
              <button onClick={handleSend} className="p-3 bg-industrial-blue text-white rounded-xl hover:bg-heat-accent hover:text-industrial-blue transition-all disabled:opacity-60" disabled={sending}>
                <ArrowRight size={20} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const CatalogPage = ({
  setPage,
  onAddToCart,
  setActiveProduct,
  products,
  productsLoading,
  publicSite = {},
  onShowCustomContact,
}: {
  setPage: (p: Page) => void;
  onAddToCart: (p: Product) => void;
  setActiveProduct: (p: Product) => void;
  products: Product[];
  productsLoading: boolean;
  publicSite?: Record<string, unknown>;
  onShowCustomContact: () => void;
}) => {
  const { t, i18n } = useTranslation("common");
  const ALL_KEY = "__all__";
  const [activeCatKey, setActiveCatKey] = useState<string>(ALL_KEY);
  const [sortKey, setSortKey] = useState<"default" | "priceAsc" | "priceDesc">("default");
  const categories = useMemo(() => {
    const byId = new Map<string, { key: string; label: string }>();
    for (const p of products) {
      const id = p.categoryId || "";
      const label = p.category || "";
      if (!label) continue;
      const key = id ? `id:${id}` : `name:${label}`;
      if (!byId.has(key)) byId.set(key, { key, label });
    }
    const list = Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
    return [{ key: ALL_KEY, label: t("catalog.all") }, ...list];
  }, [products, t, i18n.language]);

  // 切语言/重拉产品后，保证当前筛选 key 仍然存在；否则回到“全部”
  useEffect(() => {
    if (activeCatKey === ALL_KEY) return;
    if (categories.some((c) => c.key === activeCatKey)) return;
    setActiveCatKey(ALL_KEY);
  }, [activeCatKey, categories]);

  const filtered = useMemo(() => {
    const base =
      activeCatKey === ALL_KEY
        ? products.slice()
        : products.filter((p) => {
            if (activeCatKey.startsWith("id:")) return `id:${p.categoryId || ""}` === activeCatKey;
            if (activeCatKey.startsWith("name:")) return `name:${p.category || ""}` === activeCatKey;
            return true;
          });
    if (sortKey === "priceAsc") base.sort((a, b) => a.price - b.price);
    else if (sortKey === "priceDesc") base.sort((a, b) => b.price - a.price);
    return base;
  }, [products, activeCatKey, sortKey]);
  const custom = (publicSite["catalog.customSpec"] || {}) as Record<string, unknown>;
  const cTitle = String(custom.title ?? t("catalog.custom.title"));
  const cDesc = String(
    custom.description ?? t("catalog.custom.desc")
  );
  const cBtn = String(custom.buttonText ?? t("catalog.custom.button"));

  return (
  <div className="pt-32 pb-24 max-w-7xl mx-auto px-4">
    <div className="flex flex-col md:flex-row gap-12">
      <aside className="w-full md:w-64 shrink-0">
        <h3 className="text-xl font-display font-bold text-industrial-blue mb-8 pb-4 border-b border-gray-200">{t("catalog.categoriesTitle")}</h3>
        <ul className="space-y-4">
          {categories.map((cat) => (
            <li key={cat.key}>
              <button
                type="button"
                onClick={() => setActiveCatKey(cat.key)}
                className={`w-full text-left py-2 px-4 rounded-lg transition-colors ${
                  activeCatKey === cat.key
                    ? "bg-industrial-blue text-white font-bold"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {cat.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-12 p-6 bg-industrial-blue text-white rounded-2xl">
          <h4 className="font-bold mb-4">{cTitle}</h4>
          <p className="text-xs text-gray-400 mb-6">{cDesc}</p>
          <button
            type="button"
            onClick={onShowCustomContact}
            className="w-full py-3 bg-heat-accent text-industrial-blue font-bold rounded-lg text-sm hover:bg-white transition-colors"
          >
            {cBtn}
          </button>
        </div>
      </aside>

      <main className="flex-1">
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-3xl font-display font-extrabold text-industrial-blue">{t("catalog.title")}</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">{t("catalog.sort.label")}</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
              className="bg-transparent border-none focus:ring-0 font-bold text-industrial-blue"
            >
              <option value="default">{t("catalog.sort.default")}</option>
              <option value="priceAsc">{t("catalog.sort.priceAsc")}</option>
              <option value="priceDesc">{t("catalog.sort.priceDesc")}</option>
            </select>
          </div>
        </div>

        {productsLoading ? (
          <div className="text-gray-500 py-16">{t("catalog.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 py-16">{t("catalog.empty")}</div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((product) => (
            <div key={product.id} className="industrial-card group flex flex-col">
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                <img 
                  src={product.image} 
                  alt={product.name} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                />
                <div className="absolute top-4 right-4">
                  <button type="button" className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 shadow-sm transition-colors">
                    <Star size={18} />
                  </button>
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <div className="text-xs font-bold text-heat-accent uppercase tracking-widest mb-2">{product.category}</div>
                <h3 className="text-lg font-display font-bold text-industrial-blue mb-4 group-hover:text-heat-accent transition-colors cursor-pointer" onClick={() => { setActiveProduct(product); setPage("detail"); }}>
                  {product.name}
                </h3>
                <div className="space-y-2 mb-6 flex-1">
                  {product.specs.map((spec, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="w-1 h-1 bg-heat-accent rounded-full"></div>
                      {spec}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                  <div className="text-xl font-display font-extrabold text-industrial-blue">
                    <span className="text-sm font-normal mr-1">$</span>{product.price.toFixed(2)}
                  </div>
                  <button 
                    type="button"
                    onClick={() => onAddToCart(product)}
                    className="p-3 bg-industrial-blue text-white rounded-lg hover:bg-heat-accent hover:text-industrial-blue transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </main>
    </div>
  </div>
  );
};

const ProductDetailPage = ({ product, onAddToCart }: { product: Product, onAddToCart: (p: Product) => void }) => {
  const { t } = useTranslation("common");
  const [qty, setQty] = useState(1);
  const gallery = product.gallery?.length ? product.gallery : [product.image];
  const [mainImg, setMainImg] = useState(product.image);
  useEffect(() => {
    setMainImg(product.image);
    setQty(1);
  }, [product.id, product.image]);
  
  return (
    <div className="pt-32 pb-24 max-w-7xl mx-auto px-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        {/* Product Images */}
        <div className="space-y-6">
          <div className="aspect-square bg-white border border-gray-100 overflow-hidden">
            <img src={mainImg} alt={product.name} className="w-full h-full object-cover" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {gallery.slice(0, 8).map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => setMainImg(url)}
                className={`aspect-square bg-white border overflow-hidden ${
                  mainImg === url ? "border-heat-accent ring-1 ring-heat-accent" : "border-gray-100 hover:border-heat-accent"
                } transition-colors`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Product Info */}
        <div>
          <div className="flex items-center gap-4 mb-6">
            <span className="bg-industrial-blue text-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest">In Stock</span>
            <span className="text-gray-400 text-sm font-mono">ID: {product.id}</span>
          </div>
          
          <h1 className="text-4xl font-display font-extrabold text-industrial-blue mb-6">{product.name}</h1>
          
          <div className="flex items-center gap-4 mb-8">
            <div className="flex text-heat-accent">
              {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={18} fill="currentColor" />)}
            </div>
            <span className="text-sm text-gray-400">(48 条客户评价)</span>
          </div>

          <div className="text-3xl font-display font-extrabold text-industrial-blue mb-8">
            <span className="text-lg font-normal mr-1">$</span>{product.price.toFixed(2)}
            <span className="text-sm font-normal text-gray-400 ml-2">USD / 单位</span>
          </div>

          <p className="text-gray-600 mb-10 leading-relaxed">
            {product.description}
          </p>

          <div className="bg-gray-50 p-8 rounded-2xl mb-10">
            <h4 className="font-bold text-industrial-blue mb-6">{t("product.specs.title")}</h4>
            <div className="grid grid-cols-1 gap-y-3">
              {product.specs.length ? (
                product.specs.map((spec, i) => (
                  <div key={i} className="flex items-start gap-2 border-b border-gray-200 pb-2 text-sm">
                    <div className="w-1 h-1 bg-heat-accent rounded-full mt-2 shrink-0" />
                    <span className="text-industrial-blue font-medium">{spec}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">{t("product.specs.empty")}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            <div className="flex items-center border-2 border-gray-200 rounded-lg overflow-hidden h-14">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 hover:bg-gray-100 transition-colors"><Minus size={18} /></button>
              <input type="number" value={qty} readOnly className="w-16 text-center border-none focus:ring-0 font-bold" />
              <button onClick={() => setQty(qty + 1)} className="px-4 hover:bg-gray-100 transition-colors"><Plus size={18} /></button>
            </div>
            <button 
              onClick={() => onAddToCart(product)}
              className="btn-primary flex-1 h-14 justify-center text-lg"
            >
              {t("product.actions.addToCart")}
            </button>
          </div>

          <div className="mt-12 flex gap-8 pt-8 border-t border-gray-200">
            <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-industrial-blue transition-colors">
              <Download size={18} /> {t("product.actions.download")}
            </button>
            <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-industrial-blue transition-colors">
              <Share2 size={18} /> {t("product.actions.share")}
            </button>
            <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-industrial-blue transition-colors">
              <Info size={18} /> {t("product.actions.consult")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CartPage = ({
  cart,
  catalogProducts,
  onUpdateQty,
  onRemove,
  onBrowseCatalog,
}: {
  cart: { productId: string; qty: number }[];
  catalogProducts: Product[];
  onUpdateQty: (id: string, q: number) => void;
  onRemove: (id: string) => void;
  onBrowseCatalog: () => void;
}) => {
  const { t } = useTranslation("common");
  const [countryId, setCountryId] = useState("");
  const [portId, setPortId] = useState("");
  const [method, setMethod] = useState("");
  const [contact, setContact] = useState({ email: "", social: "", name: "", phone: "" });
  const [countries, setCountries] = useState<Country[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  /** 仅在用户点击「确认并提交」成功后，由订单接口返回数据填充，用于右侧展示 */
  const [orderQuote, setOrderQuote] = useState<{
    orderId: string;
    itemsTotalUsd: number;
    totalCbm: number;
    freightUsd: number;
    fixedFeesTotalUsd: number;
    totalUsd: number;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  const canQuote = Boolean(
    method &&
      contact.email.trim() &&
      contact.social.trim() &&
      contact.name.trim() &&
      contact.phone.trim() &&
      countryId &&
      portId
  );

  useEffect(() => {
    apiJson<Country[]>("/api/public/countries").then(setCountries).catch(() => setCountries([]));
  }, []);
  useEffect(() => {
    if (!countryId) {
      setPorts([]);
      setPortId("");
      return;
    }
    apiJson<Port[]>(`/api/public/ports?countryId=${encodeURIComponent(countryId)}`)
      .then(setPorts)
      .catch(() => setPorts([]));
  }, [countryId]);

  useEffect(() => {
    setOrderQuote(null);
    setConfirmErr(null);
  }, [countryId, portId, method, contact.email, contact.social, contact.name, contact.phone, cart]);

  const confirmAndSubmitOrder = async () => {
    if (!canQuote || cart.length === 0) return;
    setConfirming(true);
    setConfirmErr(null);
    try {
      const created = await apiJson<{
        id: string;
        totalCbm: unknown;
        freightUsd: unknown;
        fixedFees: unknown;
        totalUsd: unknown;
        items?: Array<{ lineTotalUsd?: unknown }>;
      }>("/api/public/orders", {
        method: "POST",
        body: JSON.stringify({
          portId,
          procurementMethod: method,
          contactEmail: contact.email.trim(),
          contactSocial: contact.social.trim(),
          contactName: contact.name.trim() || undefined,
          contactPhone: contact.phone.trim() || undefined,
          items: cart.map((c) => ({ productId: c.productId, qty: c.qty })),
        }),
      });
      const itemsTotalUsd = (created.items || []).reduce(
        (a, it) => a + Number(it.lineTotalUsd ?? 0),
        0,
      );
      const ffArr = (Array.isArray(created.fixedFees) ? created.fixedFees : []) as Array<{ amountUsd?: number }>;
      const fixedFeesTotalUsd = ffArr.reduce((a, x) => a + Number(x.amountUsd || 0), 0);
      setOrderQuote({
        orderId: created.id,
        itemsTotalUsd,
        totalCbm: Number(created.totalCbm),
        freightUsd: Number(created.freightUsd),
        fixedFeesTotalUsd,
        totalUsd: Number(created.totalUsd),
      });
      alert("已提交成功！报价已显示在右侧，您可在后台「订单」中查看本条记录。");
    } catch (e: any) {
      setOrderQuote(null);
      setConfirmErr(e?.message || "提交失败");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="pt-32 pb-24 max-w-7xl mx-auto px-4">
      <h1 className="text-4xl font-display font-extrabold text-industrial-blue mb-12">{t("cart.title")}</h1>
      
      {cart.length === 0 ? (
        <div className="bg-white p-20 text-center border border-dashed border-gray-300 rounded-3xl">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mx-auto mb-6">
            <ShoppingCart size={40} />
          </div>
          <h3 className="text-2xl font-bold text-industrial-blue mb-4">{t("cart.empty.title")}</h3>
          <p className="text-gray-500 mb-8">{t("cart.empty.desc")}</p>
          <button type="button" onClick={onBrowseCatalog} className="btn-primary mx-auto">{t("cart.empty.cta")}</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-8">
            <div className="space-y-4">
              {cart.map((item) => {
                const product =
                  catalogProducts.find((p) => p.id === item.productId) ||
                  getFallbackProduct(t);
                return (
                <div key={item.productId} className="bg-white p-6 border border-gray-100 flex flex-col sm:flex-row gap-6 items-center rounded-2xl shadow-sm">
                  <div className="w-24 h-24 shrink-0 bg-gray-100 overflow-hidden rounded-xl">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-heat-accent uppercase tracking-widest mb-1">{product.category}</div>
                    <h4 className="font-display font-bold text-industrial-blue text-lg mb-2">{product.name}</h4>
                    <div className="text-sm text-gray-400">{t("cart.unitPrice")}: ${product.price.toFixed(2)} USD</div>
                  </div>
                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                    <button onClick={() => onUpdateQty(item.productId, Math.max(1, item.qty - 1))} className="p-2 hover:bg-gray-100"><Minus size={16} /></button>
                    <span className="w-12 text-center font-bold text-sm">{item.qty}</span>
                    <button onClick={() => onUpdateQty(item.productId, item.qty + 1)} className="p-2 hover:bg-gray-100"><Plus size={16} /></button>
                  </div>
                  <div className="text-right min-w-[100px]">
                    <div className="font-display font-extrabold text-industrial-blue">${(product.price * item.qty).toFixed(2)}</div>
                    <button onClick={() => onRemove(item.productId)} className="text-xs text-red-500 hover:underline mt-2 flex items-center gap-1 ml-auto">
                      <Trash2 size={12} /> {t("cart.remove")}
                    </button>
                  </div>
                </div>
              );})}
            </div>

            <div className="bg-gray-50 p-8 rounded-3xl space-y-6">
              <h3 className="text-xl font-display font-bold text-industrial-blue">{t("cart.form.title")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{t("cart.form.country")}</label>
                  <select 
                    value={countryId}
                    onChange={(e) => setCountryId(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
                  >
                    <option value="">{t("cart.form.countryPlaceholder")}</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{t("cart.form.port")}</label>
                  <select 
                    value={portId}
                    onChange={(e) => setPortId(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
                  >
                    <option value="">{countryId ? t("cart.form.portPlaceholder") : t("cart.form.portPlaceholderNeedCountry")}</option>
                    {ports.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{t("cart.form.method")}</label>
                  <select 
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
                  >
                    <option value="">{t("cart.form.methodPlaceholder")}</option>
                    <option value="EXW">{t("cart.form.methodOptions.exw")}</option>
                    <option value="FOB">{t("cart.form.methodOptions.fob")}</option>
                    <option value="CIF">{t("cart.form.methodOptions.cif")}</option>
                    <option value="DDP">{t("cart.form.methodOptions.ddp")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{t("cart.form.email")}</label>
                  <input 
                    type="email" 
                    value={contact.email}
                    onChange={(e) => setContact({...contact, email: e.target.value})}
                    placeholder="example@mail.com"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{t("cart.form.social")}</label>
                  <input 
                    type="text" 
                    value={contact.social}
                    onChange={(e) => setContact({...contact, social: e.target.value})}
                    placeholder={t("cart.form.socialPlaceholder")}
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{t("cart.form.name")}</label>
                  <input 
                    type="text" 
                    value={contact.name}
                    onChange={(e) => setContact({...contact, name: e.target.value})}
                    placeholder="Name"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{t("cart.form.phone")}</label>
                  <input 
                    type="text" 
                    value={contact.phone}
                    onChange={(e) => setContact({...contact, phone: e.target.value})}
                    placeholder="Phone"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-industrial-blue outline-none"
                  />
                </div>
              </div>
              <div className="text-[10px] text-gray-400">
                {t("cart.hint")}
              </div>
              <button
                type="button"
                disabled={!canQuote || confirming || cart.length === 0}
                onClick={() => void confirmAndSubmitOrder()}
                className="w-full md:w-auto px-8 py-4 bg-industrial-blue text-white font-bold rounded-xl text-base hover:bg-heat-accent hover:text-industrial-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirming ? t("cart.submitting") : t("cart.confirmAndSubmit")}
              </button>
              {confirmErr && <div className="text-sm text-red-600">{confirmErr}</div>}
            </div>
          </div>

          <aside>
            <div className="bg-industrial-blue text-white p-8 rounded-3xl sticky top-32">
              <h3 className="text-xl font-display font-bold mb-8 pb-4 border-b border-white/10">{t("cart.summary.title")}</h3>
              {!canQuote ? (
                <div className="text-sm text-gray-300 leading-relaxed">
                  {t("cart.summary.fillFirst")}
                </div>
              ) : confirming ? (
                <div className="text-sm text-gray-300">{t("cart.summary.calculating")}</div>
              ) : confirmErr && !orderQuote ? (
                <div className="text-sm text-red-300">{confirmErr}</div>
              ) : !orderQuote ? (
                <div className="text-sm text-gray-300 leading-relaxed">
                  {t("cart.waitingQuote")}
                </div>
              ) : (
                <>
                  <div className="text-[10px] text-gray-400 mb-4 font-mono">{t("cart.summary.orderId")} {orderQuote.orderId}</div>
                  <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("cart.summary.itemsSubtotal")}</span>
                      <span>${orderQuote.itemsTotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("cart.summary.totalCbm")}</span>
                      <span>{orderQuote.totalCbm.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("cart.summary.freight")}</span>
                      <span>${orderQuote.freightUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">{t("cart.summary.fixedFees")}</span>
                      <span>${orderQuote.fixedFeesTotalUsd.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-end mb-8">
                    <span className="text-gray-400">{t("cart.summary.total")}</span>
                    <span className="text-3xl font-display font-extrabold text-heat-accent">${orderQuote.totalUsd.toFixed(2)}</span>
                  </div>
                </>
              )}

              <div className="bg-white/5 p-4 rounded-xl mb-4">
                <p className="text-xs text-gray-400 leading-relaxed italic">
                  {t("cart.agreementNote")}
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

// --- Main App ---

export default function App(props?: { initialPage?: Page }) {
  const { t, i18n } = useTranslation("common");
  const [lang, setLangState] = useState<Lang>(getLang());
  const [page, setPage] = useState<Page>(props?.initialPage ?? "home");
  const [cart, setCart] = useState<{ productId: string; qty: number }[]>([]);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const systems = useMemo(() => getLocalizedSystems(t), [t, lang]);
  const projects = useMemo(() => getLocalizedProjects(t), [t, lang]);
  const [activeSystem, setActiveSystem] = useState<System>(() => systems[0]);
  const [activeProject, setActiveProject] = useState<Project>(() => projects[0]);
  const [activeProduct, setActiveProduct] = useState<Product>(() => getFallbackProduct(t));
  const [publicSite, setPublicSite] = useState<Record<string, unknown>>({});
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const productsHydrated = useRef(false);

  useEffect(() => {
    const next = (lng: string) => {
      const l = (lng || getLang()) as Lang;
      setLang(l);
      setLangState(l);
    };
    i18n.on("languageChanged", next);
    // align on first mount
    next(i18n.language);
    return () => {
      i18n.off("languageChanged", next);
    };
  }, [i18n]);

  // Keep active selections stable across language changes (by id)
  useEffect(() => {
    setActiveSystem((prev) => systems.find((s) => s.id === prev?.id) || systems[0]);
  }, [systems]);
  useEffect(() => {
    setActiveProject((prev) => projects.find((p) => p.id === prev?.id) || projects[0]);
  }, [projects]);

  useEffect(() => {
    apiJson<Record<string, unknown>>("/api/public/site-settings")
      .then(setPublicSite)
      .catch(() => setPublicSite({}));
  }, [lang]);

  useEffect(() => {
    setProductsLoading(true);
    apiJson<ApiProduct[]>("/api/public/products")
      .then((rows) => {
        const list = rows.map(toLegacyProduct);
        setCatalogProducts(list);
        if (list.length > 0) {
          const keepId = activeProduct?.id;
          const keep = keepId ? list.find((p) => p.id === keepId) : undefined;
          if (keep) setActiveProduct(keep);
          else if (!productsHydrated.current) {
            productsHydrated.current = true;
            setActiveProduct(list[0]);
          }
        }
      })
      .catch(() => setCatalogProducts([]))
      .finally(() => setProductsLoading(false));
  }, [lang]);

  const contactCfg = (publicSite.contact || {}) as {
    phone?: string;
    email?: string;
    whatsapp?: string;
  };
  const footerCfg = (publicSite.footer || {}) as Record<string, unknown>;

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => item.productId === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { productId: product.id, qty: 1 }];
    });
  };

  const addToCartWithQty = (product: Product, qty: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + qty } : i));
      }
      return [...prev, { productId: product.id, qty }];
    });
  };

  const updateQty = (id: string, q: number) => {
    setCart(prev => prev.map(item => item.productId === id ? { ...item, qty: q } : item));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.productId !== id));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar 
        activePage={page} 
        setPage={setPage} 
        cartCount={cart.reduce((a, c) => a + c.qty, 0)} 
        onGetQuote={() => setPage("cart")}
        onAdmin={() => setIsAdminLoginOpen(true)}
      />
      <SidebarSocial onShowContact={() => setIsContactOpen(true)} />
      
      <main className="flex-grow">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.3 }}
          >
            {page === "home" && (
              <HomePage 
                setPage={setPage} 
                onShowAIChat={() => setIsAIChatOpen(true)} 
                setActiveSystem={setActiveSystem}
                setActiveProject={setActiveProject}
                publicSite={publicSite}
              />
            )}
            {page === "admin" && <AdminPage onBack={() => setPage("home")} />}
            {page === "catalog" && (
              <CatalogPage 
                setPage={setPage} 
                onAddToCart={addToCart} 
                setActiveProduct={setActiveProduct}
                products={catalogProducts}
                productsLoading={productsLoading}
                publicSite={publicSite}
                onShowCustomContact={() => setIsContactOpen(true)}
              />
            )}
            {page === "detail" && <ProductDetailPage product={activeProduct} onAddToCart={addToCart} />}
            {page === "cart" && (
              <CartPage
                cart={cart}
                catalogProducts={catalogProducts}
                onUpdateQty={updateQty}
                onRemove={removeFromCart}
                onBrowseCatalog={() => setPage("catalog")}
              />
            )}
            {page === "projects" && (
              <ProjectsPage setPage={setPage} setActiveProject={setActiveProject} publicSite={publicSite} />
            )}
            {page === "projectDetail" && <ProjectDetailPage project={activeProject} />}
            {page === "about" && <AboutPage publicSite={publicSite} />}
            {page === "systemDetail" && <SystemDetailPage system={activeSystem} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <ContactModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
        contact={contactCfg}
      />
      <AIChatModal
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        setPage={setPage}
        onSetActiveProduct={setActiveProduct}
        onAddToCartWithQty={addToCartWithQty}
      />
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
        onLoggedIn={(u) => {
          setAdminUser(u);
          setPage("admin");
        }}
      />

      <Footer onShowContact={() => setIsContactOpen(true)} footerCfg={footerCfg} />
    </div>
  );
}
