import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorText, formatDay, money, STATUS_LABELS, whole, type CompanyRow, type CompanyStatus, type TenantRow } from "../api";
import { useShell } from "../shell";
import { ConfirmDialog, Empty, StatePill, StatusBadge, useToast } from "./Ui";

type Filter = CompanyStatus | "all";
export type CompanyAction = "approve" | "reject" | "suspend" | "reactivate";
type Target = { id: string; code: number; name_ar: string; owner_email: string };

const ACTIONS: Record<CompanyAction, { title: string; label: string; danger: boolean; reason: boolean; message: (c: Target) => string }> = {
  approve: {
    title: "الموافقة على المنشأة",
    label: "موافقة وتفعيل",
    danger: false,
    reason: false,
    message: (c) =>
      `ستُفعَّل «${c.name_ar}» برقم ${c.code}، وتُنسخ لها الإعدادات الأولية (الحسابات والأدوار والفروع)، ويُنشأ مدير النظام ببريد ${c.owner_email}. تبدأ فترتها التجريبية المجانية الآن.`,
  },
  reject: {
    title: "رفض طلب التسجيل",
    label: "رفض",
    danger: true,
    reason: true,
    message: (c) => `سيُرفض طلب «${c.name_ar}»، ويستطيع صاحب البريد ${c.owner_email} التسجيل من جديد.`,
  },
  suspend: {
    title: "إيقاف المنشأة",
    label: "إيقاف",
    danger: true,
    reason: true,
    message: (c) => `سيتوقف دخول كل مستخدمي «${c.name_ar}» حتى إعادة التفعيل. البيانات لا تُحذف. (للقراءة فقط بدل الإيقاف الكامل استخدم صفحة الاشتراك.)`,
  },
  reactivate: {
    title: "إعادة تفعيل المنشأة",
    label: "إعادة التفعيل",
    danger: false,
    reason: false,
    message: (c) => `سيعود مستخدمو «${c.name_ar}» للدخول.`,
  },
};

/** موافقة ورفض وإيقاف وإعادة تفعيل، بنافذة تأكيد (تُستخدم في المنشآت والرئيسية وصفحة المنشأة) */
export function useCompanyAction(onChanged: () => void) {
  const toast = useToast();
  const { reloadStats } = useShell();
  const [pending, setPending] = useState<{ company: Target; action: CompanyAction } | null>(null);

  const run = async (company: Target, action: CompanyAction, reason: string) => {
    try {
      if (action === "approve") {
        const result = await api.approve(company.id);
        toast("ok", `فُعّلت المنشأة ${result.code}${result.owner_emp_id ? ` — مدير النظام ${result.owner_emp_id}` : ""}`);
      } else if (action === "reject") {
        await api.reject(company.id, reason);
        toast("ok", "رُفض الطلب");
      } else if (action === "suspend") {
        await api.suspend(company.id, reason);
        toast("ok", "أوقفت المنشأة");
      } else {
        await api.reactivate(company.id);
        toast("ok", "أعيد تفعيل المنشأة");
      }
      void reloadStats();
      onChanged();
    } catch (error) {
      toast("error", errorText(error));
      throw error;
    }
  };

  const dialog = pending ? (
    <ConfirmDialog
      title={ACTIONS[pending.action].title}
      message={ACTIONS[pending.action].message(pending.company)}
      confirmLabel={ACTIONS[pending.action].label}
      danger={ACTIONS[pending.action].danger}
      needReason={ACTIONS[pending.action].reason}
      onConfirm={(reason) => run(pending.company, pending.action, reason)}
      onClose={() => setPending(null)}
    />
  ) : null;

  return { dialog, open: (company: Target, action: CompanyAction) => setPending({ company, action }) };
}

export function CompanyActionButtons({ company, status, open }: { company: Target; status: CompanyStatus; open: (c: Target, a: CompanyAction) => void }) {
  return (
    <>
      {status === "pending" ? (
        <>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => open(company, "approve")}>موافقة</button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => open(company, "reject")}>رفض</button>
        </>
      ) : null}
      {status === "active" ? <button type="button" className="btn btn-sm btn-danger" onClick={() => open(company, "suspend")}>إيقاف</button> : null}
      {status === "suspended" ? <button type="button" className="btn btn-sm btn-primary" onClick={() => open(company, "reactivate")}>إعادة التفعيل</button> : null}
    </>
  );
}

/** المنشآت: التسجيل والموافقة والإيقاف، مع الباقة وحالة الاشتراك */
export default function Companies() {
  const toast = useToast();
  const { go, tick, stats } = useShell();
  const [filter, setFilter] = useState<Filter>(() => (stats && stats.pending > 0 ? "pending" : "all"));
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [tenants, setTenants] = useState<Record<string, TenantRow>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listCompanies(filter === "all" ? null : filter));
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setLoading(false);
    }
    // الباقة والحالة من S15 (إن لم تُطبَّق تبقى الأعمدة فارغة)
    try {
      const list = await api.listTenants("all");
      setTenants(Object.fromEntries(list.map((t) => [t.id, t])));
    } catch {
      setTenants({});
    }
  }, [filter, toast]);

  useEffect(() => { void load(); }, [load, tick]);
  const { dialog, open } = useCompanyAction(() => void load());

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.code, row.name_ar, row.name_en, row.owner_email, row.vat_number, row.cr_number, row.phone, row.city]
        .some((value) => String(value ?? "").toLowerCase().includes(term)));
  }, [rows, search]);

  const counts: Partial<Record<Filter, number>> = stats
    ? { all: stats.companies, pending: stats.pending, active: stats.active_companies, suspended: stats.suspended }
    : {};
  const filters: Filter[] = ["all", "pending", "active", "suspended", "rejected"];

  return (
    <section className="card">
      <div className="toolbar">
        <div className="chips">
          {filters.map((value) => (
            <button key={value} type="button" className={`chip ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>
              {value === "all" ? "الكل" : STATUS_LABELS[value]}
              {counts[value] !== undefined ? <span className="count">{counts[value]}</span> : null}
            </button>
          ))}
        </div>
        <input className="search" placeholder="بحث بالاسم أو الرقم أو البريد أو الرقم الضريبي" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>المنشأة</th>
              <th>صاحب المنشأة</th>
              <th>التسجيل</th>
              <th>الاشتراك</th>
              <th className="num">الموظفون</th>
              <th className="num">المستخدمون</th>
              <th className="num">الرصيد</th>
              <th>أُنشئت</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={10}><Empty>جاري التحميل...</Empty></td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={10}><Empty>{filter === "pending" ? "لا طلبات تسجيل بانتظار الموافقة." : "لا توجد منشآت."}</Empty></td></tr>
            ) : visible.map((row) => {
              const t = tenants[row.id];
              return (
                <tr key={row.id}>
                  <td className="mono">{row.code}</td>
                  <td>
                    <button type="button" className="link" onClick={() => go(`company/${row.id}`)}>{row.name_ar}</button>
                    {row.name_en ? <div className="sub" dir="ltr">{row.name_en}</div> : null}
                    {row.status_reason && row.status !== "active" ? <div className="sub warn-text">{row.status_reason}</div> : null}
                  </td>
                  <td dir="ltr" className="mono">{row.owner_email || "—"}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>
                    {t && t.state !== "none" ? (
                      <div>
                        <StatePill state={t.state} />
                        <div className="sub">{t.plan_name ?? ""}{t.state === "trial" && t.trial_ends_at ? ` حتى ${formatDay(t.trial_ends_at)}` : ""}</div>
                      </div>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="num">{whole(row.employees)}</td>
                  <td className="num">{whole(row.users)}</td>
                  <td className={`num ${t && t.balance > 0 ? "danger-text" : ""}`}>{t ? money(t.balance) : "—"}</td>
                  <td className="nowrap">{formatDay(row.created_at)}</td>
                  <td>
                    <div className="actions">
                      <CompanyActionButtons company={row} status={row.status} open={open} />
                      <button type="button" className="btn btn-sm" onClick={() => go(`company/${row.id}`)}>فتح</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dialog}
    </section>
  );
}
