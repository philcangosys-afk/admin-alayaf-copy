import { useCallback, useEffect, useState } from "react";
import { api, errorText, formatDate, type SubRequest } from "../api";
import { useShell } from "../shell";
import { ConfirmDialog, Empty, StatePill, useToast } from "../components/Ui";

type Status = "open" | "done" | "cancelled" | "all";
const LABELS: Record<Status, string> = { open: "مفتوحة", done: "تمّت", cancelled: "مُلغاة", all: "الكل" };

/** طلبات الاشتراك التي ترسلها المنشآت من صفحة «الاشتراك» في النظام */
export default function Requests() {
  const toast = useToast();
  const { go, tick, reloadStats } = useShell();
  const [status, setStatus] = useState<Status>("open");
  const [rows, setRows] = useState<SubRequest[]>([]);
  const [closing, setClosing] = useState<SubRequest | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.listRequests(status));
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [status, toast]);

  useEffect(() => { void load(); }, [load, tick]);

  return (
    <section className="card">
      <div className="toolbar">
        <div className="chips">
          {(Object.keys(LABELS) as Status[]).map((s) => (
            <button key={s} type="button" className={`chip ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>{LABELS[s]}</button>
          ))}
        </div>
        <span className="muted small">التفعيل من صفحة المنشأة: يُغلق الطلب تلقائيًا ويُرسل الرد.</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>الوقت</th><th>المنشأة</th><th>الباقة المطلوبة</th><th>الدورة</th><th>ملاحظة المنشأة</th><th>الحالة الآن</th><th>الرد</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8}><Empty>{status === "open" ? "لا طلبات مفتوحة." : "لا طلبات."}</Empty></td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{formatDate(r.created_at)}</td>
                <td><button type="button" className="link" onClick={() => go(`company/${r.company_id}`)}>{r.company_name}</button><div className="sub mono">{r.company_code}</div></td>
                <td>{r.plan_name}</td>
                <td>{r.billing_cycle === "yearly" ? "سنوية" : "شهرية"}</td>
                <td>{r.note || <span className="muted">—</span>}</td>
                <td>{r.state ? <StatePill state={r.state} /> : "—"}</td>
                <td>{r.status === "open" ? <span className="pill pill-warn">مفتوح</span> : <>{r.response || LABELS[r.status]}<div className="sub">{formatDate(r.handled_at)}</div></>}</td>
                <td>
                  {r.status === "open" ? (
                    <div className="actions">
                      <button type="button" className="btn btn-sm" onClick={() => setClosing(r)}>إغلاق</button>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => go(`company/${r.company_id}`)}>تفعيل</button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {closing ? (
        <ConfirmDialog
          title="إغلاق طلب الاشتراك بلا تفعيل"
          message={`طلب «${closing.company_name}» لباقة ${closing.plan_name}. لا يتغير الاشتراك.`}
          confirmLabel="إغلاق الطلب"
          needReason
          reasonLabel="الرد"
          onConfirm={async (reason) => {
            try {
              await api.resolveRequest(closing.id, "cancelled", reason);
              toast("ok", "أُغلق الطلب");
              void reloadStats();
              await load();
            } catch (error) {
              toast("error", errorText(error));
              throw error;
            }
          }}
          onClose={() => setClosing(null)}
        />
      ) : null}
    </section>
  );
}
