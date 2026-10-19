import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, bootSession, configMissing, errorText, type SaasStats } from "./api";
import { ShellContext, useRoute, type Shell } from "./shell";
import {
  AlertIcon, BrandMark, BuildingIcon, CrownIcon, HomeIcon, InboxIcon, LayersIcon, MegaphoneIcon, MenuIcon, ReceiptIcon, RefreshIcon, ScrollIcon,
  SettingsIcon,
} from "./components/Icons";
import Companies from "./components/Companies";
import CreateCompany from "./components/CreateCompany";
import CompanyPage from "./components/CompanyPanel";
import Home from "./pages/Home";
import Subscriptions from "./pages/Subscriptions";
import Requests from "./pages/Requests";
import Billing from "./pages/Billing";
import Plans from "./pages/Plans";
import Announcements from "./pages/Announcements";
import Settings from "./pages/Settings";
import Audit from "./pages/Audit";
import Errors from "./pages/Errors";

type Boot = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; email: string };

type NavItem = { path: string; label: string; icon: (p: { className?: string }) => JSX.Element; count?: (s: SaasStats) => number };
const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "التشغيل",
    items: [
      { path: "home", label: "الرئيسية", icon: HomeIcon },
      { path: "companies", label: "المنشآت", icon: BuildingIcon, count: (s) => s.pending },
      { path: "requests", label: "طلبات الاشتراك", icon: InboxIcon, count: (s) => s.open_requests },
    ],
  },
  {
    title: "الإيرادات",
    items: [
      { path: "subscriptions", label: "الاشتراكات", icon: CrownIcon, count: (s) => s.trials_ending },
      { path: "billing", label: "الفواتير والمدفوعات", icon: ReceiptIcon },
      { path: "plans", label: "الباقات والأسعار", icon: LayersIcon },
    ],
  },
  {
    title: "المنصة",
    items: [
      { path: "announcements", label: "الإعلانات", icon: MegaphoneIcon },
      { path: "settings", label: "الإعدادات", icon: SettingsIcon },
      { path: "audit", label: "سجل العمليات", icon: ScrollIcon },
      { path: "errors", label: "أخطاء النظام", icon: AlertIcon },
    ],
  },
];

const TITLES: Record<string, string> = {
  home: "الرئيسية",
  companies: "المنشآت",
  company: "المنشأة",
  requests: "طلبات الاشتراك",
  subscriptions: "الاشتراكات",
  billing: "الفواتير والمدفوعات",
  plans: "الباقات والأسعار",
  announcements: "إعلانات المنصة",
  settings: "إعدادات المنصة",
  audit: "سجل العمليات",
  errors: "أخطاء النظام",
};

/**
 * لوحة إدارة المنصة: تعمل على هذا الجهاز فقط (127.0.0.1)، وتدخل تلقائيًا بحساب مدير المنصة من .env.local
 * (كلمة المرور يقرؤها خادم اللوحة المحلي ولا تصل إلى المتصفح).
 * كل العمليات عبر دوال platform_* في قاعدة البيانات، وهي تتحقق بنفسها أن الحساب مدير منصة وتسجّل كل تعديل.
 */
export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const [parts, go] = useRoute();
  const [stats, setStats] = useState<SaasStats | null>(null);
  const [statsError, setStatsError] = useState("");
  const [tick, setTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // الدخول التلقائي بحساب مدير المنصة
  useEffect(() => {
    const missing = configMissing();
    if (missing.length) {
      setBoot({ state: "error", message: `أكمل ملف .env.local: ${missing.join("، ")}` });
      return;
    }
    let active = true;
    (async () => {
      const session = await bootSession();
      if (!active) return;
      if (!session.ok) {
        setBoot({ state: "error", message: session.message });
        return;
      }
      try {
        const isAdmin = await api.isPlatformAdmin();
        if (!active) return;
        if (!isAdmin) {
          setBoot({ state: "error", message: `الحساب ${session.email} ليس مدير منصة. أضفه في جدول platform_admins من SQL Editor.` });
          return;
        }
      } catch (error) {
        if (active) setBoot({ state: "error", message: errorText(error) });
        return;
      }
      setBoot({ state: "ready", email: session.email });
    })();
    return () => { active = false; };
  }, []);

  const reloadStats = useCallback(async () => {
    try {
      setStats(await api.saasStats());
      setStatsError("");
    } catch (error) {
      setStatsError(errorText(error));
    }
  }, []);

  useEffect(() => {
    if (boot.state === "ready") void reloadStats();
  }, [boot.state, reloadStats, tick]);

  useEffect(() => setMenuOpen(false), [parts]);

  const page = parts[0] ?? "home";
  const shell = useMemo<Shell>(() => ({ stats, statsError, reloadStats, go, tick }), [stats, statsError, reloadStats, go, tick]);

  if (boot.state === "loading") {
    return <div className="center-screen">جاري الدخول إلى لوحة المنصة...</div>;
  }
  if (boot.state === "error") {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h1 className="card-title">لوحة إدارة المنصة</h1>
          <p className="notice error">{boot.message}</p>
          <p className="muted">بعد التعديل أعد تحميل الصفحة.</p>
        </div>
      </div>
    );
  }

  let body: ReactNode;
  if (page === "companies" && parts[1] === "new") body = <CreateCompany />;
  else if (page === "companies") body = <Companies />;
  else if (page === "company" && parts[1]) body = <CompanyPage key={parts[1]} companyId={parts[1]} tab={parts[2] ?? "overview"} />;
  else if (page === "subscriptions") body = <Subscriptions />;
  else if (page === "requests") body = <Requests />;
  else if (page === "billing") body = <Billing />;
  else if (page === "plans") body = <Plans />;
  else if (page === "announcements") body = <Announcements />;
  else if (page === "settings") body = <Settings />;
  else if (page === "audit") body = <Audit />;
  else if (page === "errors") body = <Errors />;
  else body = <Home />;

  const activeNav = page === "company" ? "companies" : page;

  return (
    <ShellContext.Provider value={shell}>
      <div className="shell">
        <aside className={`sidebar ${menuOpen ? "open" : ""}`} aria-label="القائمة">
          <div className="brand">
            <BrandMark className="brand-mark" />
            <div>
              <b>إدارة المنصة</b>
              <span>نظام إدارة المنشآت</span>
            </div>
          </div>
          {NAV.map((group) => (
            <nav key={group.title} className="nav-group" aria-label={group.title}>
              <div className="nav-title">{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = stats && item.count ? item.count(stats) : 0;
                return (
                  <button
                    key={item.path}
                    type="button"
                    className={`nav-item ${activeNav === item.path ? "active" : ""}`}
                    aria-current={activeNav === item.path ? "page" : undefined}
                    onClick={() => go(item.path)}
                  >
                    <Icon />
                    {item.label}
                    {count > 0 ? <span className="nav-count">{count}</span> : null}
                  </button>
                );
              })}
            </nav>
          ))}
          <div className="sidebar-foot">
            محلية فقط على هذا الجهاز
            <br />
            <span dir="ltr">{boot.email}</span>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="row">
              <button type="button" className="btn btn-ghost menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="القائمة">
                <MenuIcon />
              </button>
              <div>
                {page === "company" ? (
                  <div className="crumbs">
                    <button type="button" onClick={() => go("companies")}>المنشآت</button>
                  </div>
                ) : null}
                <h1>{TITLES[page] ?? "الرئيسية"}</h1>
              </div>
            </div>
            <div className="row">
              {page === "companies" && parts[1] !== "new" ? (
                <button type="button" className="btn btn-primary" onClick={() => go("companies/new")}>منشأة جديدة</button>
              ) : null}
              <button type="button" className="btn" onClick={() => setTick((n) => n + 1)}>
                <RefreshIcon />
                تحديث
              </button>
            </div>
          </header>
          <main className="content">
            {statsError ? (
              <div className="notice warn">
                {statsError.includes("S15") ? statsError : `تعذر تحميل أرقام الاشتراكات: ${statsError}`}
              </div>
            ) : null}
            {body}
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
