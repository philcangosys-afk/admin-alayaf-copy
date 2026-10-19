import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTION_LABELS, api, errorText, type AuditRow } from "../api";
import { useShell } from "../shell";
import AuditTable from "../components/AuditTable";
import { useToast } from "../components/Ui";

const GROUPS: Array<{ id: string; label: string; match: (a: string) => boolean }> = [
  { id: "all", label: "الكل", match: () => true },
  { id: "company", label: "المنشآت", match: (a) => a.startsWith("company_") || a.startsWith("owner_") || a.startsWith("member_") },
  { id: "subscription", label: "الاشتراكات", match: (a) => a.startsWith("subscription_") },
  { id: "billing", label: "الفوترة", match: (a) => a.startsWith("invoice_") || a.startsWith("payment_") || a.startsWith("adjustment_") },
  { id: "platform", label: "إعدادات المنصة", match: (a) => a.startsWith("plan_") || a.startsWith("settings_") || a.startsWith("announcement_") },
];

/** سجل كل عمليات المنصة (لا يُعدَّل ولا يُحذف) */
export default function Audit() {
  const toast = useToast();
  const { tick } = useShell();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await api.audit(null, 1000));
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load, tick]);

  const visible = useMemo(() => {
    const g = GROUPS.find((x) => x.id === group) ?? GROUPS[0];
    const term = search.trim().toLowerCase();
    return rows.filter((r) => g.match(r.action)
      && (!term || [r.company_name, r.company_code, r.actor_email, ACTION_LABELS[r.action] ?? r.action, JSON.stringify(r.details ?? {})]
        .some((v) => String(v ?? "").toLowerCase().includes(term))));
  }, [rows, group, search]);

  return (
    <section className="card">
      <div className="toolbar">
        <div className="chips">
          {GROUPS.map((g) => (
            <button key={g.id} type="button" className={`chip ${group === g.id ? "active" : ""}`} onClick={() => setGroup(g.id)}>{g.label}</button>
          ))}
        </div>
        <input className="search" placeholder="بحث بالمنشأة أو المنفّذ أو التفاصيل" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <AuditTable rows={visible} showCompany />
    </section>
  );
}
