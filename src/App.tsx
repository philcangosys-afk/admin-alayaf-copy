import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  api, bootSession, configMissing, configMissingText, errorText, isLocalPanel, isSessionError, purgeStoredSession, signInPanel, signOutPanel,
  supabase, type SaasStats,
} from "./api";
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

type Boot =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "login"; message: string }
  | { state: "ready"; email: string };

/** بعد فتح الجلسة: الحساب يجب أن يكون في platform_admins، والدوال نفسها ترفض غيره على أي حال */
async function verifyAdmin(email: string): Promise<Boot> {
  try {
    if (await api.isPlatformAdmin()) {
      if (isLocalPanel) return { state: "ready", email };
      // خروج من تبويب آخر أثناء التحقق: لا نفتح اللوحة بلا جلسة
      const { data } = await supabase().auth.getSession();
      if (!data.session) return { state: "login", message: "انتهت الجلسة. ادخل مرة أخرى." };
      return { state: "ready", email };
    }
    const message = isLocalPanel
      ? `الحساب ${email} ليس مدير منصة. أضفه في جدول platform_admins من SQL Editor.`
      : `الحساب ${email} ليس مدير منصة.`;
    if (isLocalPanel) return { state: "error", message };
    await signOutPanel();
    return { state: "login", message };
  } catch (error) {
    if (!isLocalPanel && isSessionError(error)) {
      await signOutPanel();
      return { state: "login", message: "انتهت الجلسة. ادخل مرة أخرى." };
    }
    return { state: "error", message: errorText(error) };
  }
}

/** شاشة الدخول (الاستضافة فقط): كلمة المرور تذهب إلى Supabase مباشرة */
function LoginCard({ message, onReady }: { message: string; onReady: (boot: Boot) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await signInPanel(email, password);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    const next = await verifyAdmin(result.email);
    if (next.state === "ready") {
      onReady(next);
      return;
    }
    // تعذر التحقق (اتصال أو خادم): لا تبقى جلسة محفوظة والشاشة شاشة دخول
    if (next.state === "error") await signOutPanel();
    setPassword("");
    setError(next.state === "login" || next.state === "error" ? next.message : "");
    setBusy(false);
  };

  return (
    <div className="center-screen">
      <form className="card narrow login-card" onSubmit={submit} noValidate>
        <div className="login-head">
          <BrandMark className="brand-mark" />
          <div>
            <h1 className="card-title">لوحة إدارة المنصة</h1>
            <p className="muted">ادخل بحساب مدير المنصة.</p>
          </div>
        </div>
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        <label className="field">
          <span>البريد الإلكتروني</span>
          <input
            type="email"
            dir="ltr"
            autoComplete="username"
            autoFocus
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>كلمة المرور</span>
          <input
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
          {busy ? "جاري الدخول..." : "دخول"}
        </button>
      </form>
    </div>
  );
}

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
 * لوحة إدارة المنصة.
 * - على هذا الجهاز (127.0.0.1): تدخل تلقائيًا بحساب مدير المنصة من .env.local
 *   (كلمة المرور يقرؤها خادم اللوحة المحلي ولا تصل إلى المتصفح).
 * - على الاستضافة: شاشة دخول بالبريد وكلمة المرور، وزر تسجيل خروج.
 * كل العمليات عبر دوال platform_* في قاعدة البيانات، وهي تتحقق بنفسها أن الحساب مدير منصة وتسجّل كل تعديل.
 */
export default function App() {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const [parts, go] = useRoute();
  const [stats, setStats] = useState<SaasStats | null>(null);
  const [statsError, setStatsError] = useState("");
  const [tick, setTick] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // بداية الجلسة: تلقائية على هذا الجهاز، أو الجلسة المحفوظة / شاشة الدخول على الاستضافة
  useEffect(() => {
    const missing = configMissing();
    if (missing.length) {
      setBoot({ state: "error", message: configMissingText(missing) });
      return;
    }
    let active = true;
    (async () => {
      const session = await bootSession();
      if (!active) return;
      if (!session.ok) {
        setBoot(session.login ? { state: "login", message: session.message } : { state: "error", message: session.message });
        return;
      }
      const next = await verifyAdmin(session.email);
      if (active) setBoot(next);
    })();
    return () => { active = false; };
  }, []);

  // الاستضافة: انتهاء الجلسة أثناء العمل (أو الخروج من تبويب آخر) يعيد إلى شاشة الدخول ويمسح جلسة هذا التبويب
  useEffect(() => {
    if (isLocalPanel || configMissing().length) return;
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      purgeStoredSession();
      setBoot((prev) =>
        prev.state === "ready" || prev.state === "error" ? { state: "login", message: "انتهت الجلسة. ادخل مرة أخرى." } : prev,
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // الخروج قد يأخذ ثواني دون اتصال (يحاول Supabase تجديد الجلسة أولًا): الزر معطّل حتى ينتهي
  const [signingOut, setSigningOut] = useState(false);
  const signOut = useCallback(async () => {
    setSigningOut(true);
    await signOutPanel();
    setSigningOut(false);
    setStats(null);
    setStatsError("");
    setBoot({ state: "login", message: "" });
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
  if (boot.state === "login") {
    return <LoginCard message={boot.message} onReady={setBoot} />;
  }
  if (boot.state === "error") {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h1 className="card-title">لوحة إدارة المنصة</h1>
          <p className="notice error">{boot.message}</p>
          {isLocalPanel ? (
            <p className="muted">بعد التعديل أعد تحميل الصفحة.</p>
          ) : (
            <div className="row-end">
              {configMissing().length ? null : (
                <button type="button" className="btn" disabled={signingOut} onClick={() => void signOut()}>
                  {signingOut ? "جاري الخروج..." : "تسجيل الخروج"}
                </button>
              )}
              <button type="button" className="btn btn-primary" disabled={signingOut} onClick={() => window.location.reload()}>إعادة المحاولة</button>
            </div>
          )}
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
            {isLocalPanel ? (
              <>
                محلية فقط على هذا الجهاز
                <br />
              </>
            ) : null}
            <span dir="ltr">{boot.email}</span>
            {!isLocalPanel ? (
              <button type="button" className="sidebar-signout" disabled={signingOut} onClick={() => void signOut()}>
                {signingOut ? "جاري الخروج..." : "تسجيل الخروج"}
              </button>
            ) : null}
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
