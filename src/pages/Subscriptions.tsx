import { useCallback, useEffect, useMemo, useState } from "react";
import { api, daysTextGen, daysUntil, errorText, formatDay, money, type TenantFilter, type TenantRow } from "../api";
import { useRoute, useShell } from "../shell";
import { Empty, StatePill, useToast } from "../components/Ui";

const FILTERS: Array<{ id: TenantFilter; label: string }> = [
  { id: "active", label: "كل المنشآت الفعّالة" },
  { id: "trial", label: "في التجربة" },
  { id: "trial_ending", label: "تجارب تنتهي خلال 3 أيام" },
  { id: "read_only", label: "قراءة فقط" },
  { id: "paying", label: "مشتركة" },
  { id: "past_due", label: "متأخرة أو في المهلة" },
  { id: "complimentary", label: "مجانية" },
  { id: "balance", label: "عليها رصيد" },
  { id: "requests", label: "لها طلب مفتوح" },
];

/** الاشتراكات: كل منشأة بباقتها وحالتها ونهاية فترتها واستخدامها ورصيدها */
export default function Subscriptions() {
  const toast = useToast();
  const { go, tick } = useShell();
  const [parts] = useRoute();
  const initial = (FILTERS.some((f) => f.id === parts[1]) ? parts[1] : "active") as TenantFilter;
  const [filter, setFilter] = useState<TenantFilter>(initial);
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => setFilter(initial), [initial]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listTenants(filter));
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => { void load(); }, [load, tick]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? rows.filter((r) => [r.code, r.name_ar, r.owner_email, r.plan_name, r.vat_number].some((v) => String(v ?? "").toLowerCase().includes(term)))
      : rows;
    // الأقرب انتهاءً أولًا
    const endOf = (r: TenantRow) => new Date((r.state === "trial" || r.state === "trial_expired" ? r.trial_ends_at : r.current_period_end) ?? "2999-01-01").getTime();
    return [...list].sort((a, b) => endOf(a) - endOf(b));
  }, [rows, search]);

  return (
    <section className="card">
      <div className="toolbar">
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`chip ${filter === f.id ? "active" : ""}`} onClick={() => go(`subscriptions/${f.id}`)}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="search" placeholder="بحث بالمنشأة أو الباقة أو البريد" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>المنشأة</th>
              <th>الباقة</th>
              <th>الحالة</th>
              <th>النهاية</th>
              <th>الدورة</th>
              <th className="num">المستخدمون</th>
              <th className="num">الموظفون</th>
              <th className="num">الرصيد</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={9}><Empty>جاري التحميل...</Empty></td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={9}><Empty>لا منشآت في هذا التصنيف.</Empty></td></tr>
            ) : visible.map((r) => {
              const end = r.state === "trial" || r.state === "trial_expired" ? r.trial_ends_at : r.current_period_end;
              const left = daysUntil(end);
              return (
                <tr key={r.id}>
                  <td>
                    <button type="button" className="link" onClick={() => go(`company/${r.id}`)}>{r.name_ar}</button>
                    <div className="sub"><span className="mono">{r.code}</span>{r.open_request ? <span className="warn-text">، طلب اشتراك مفتوح</span> : null}</div>
                  </td>
                  <td>{r.plan_name ?? "—"}</td>
                  <td><StatePill state={r.state} /></td>
                  <td className="nowrap">
                    {r.state === "complimentary" || !end ? "—" : formatDay(end)}
                    {left !== null && r.state !== "complimentary" ? (
                      <div className={`sub ${left <= 0 ? "danger-text" : left <= 3 ? "warn-text" : ""}`}>
                        {left > 0 ? `بعد ${daysTextGen(left)}` : left === 0 ? "اليوم" : `منذ ${daysTextGen(-left)}`}
                      </div>
                    ) : null}
                  </td>
                  <td>{r.state === "trial" || r.state === "trial_expired" ? "تجربة" : r.state === "complimentary" ? "—" : r.billing_cycle === "yearly" ? "سنوية" : "شهرية"}</td>
                  <td className="num">{r.usage?.users ?? 0}</td>
                  <td className="num">{r.usage?.employees ?? 0}</td>
                  <td className={`num ${r.balance > 0 ? "danger-text" : ""}`}>{money(r.balance)}</td>
                  <td><div className="actions"><button type="button" className="btn btn-sm" onClick={() => go(`company/${r.id}`)}>إدارة</button></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
