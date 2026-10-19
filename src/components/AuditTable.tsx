import { ACTION_LABELS, formatDate, type AuditRow } from "../api";
import { useShell } from "../shell";
import { Empty } from "./Ui";

/** تفاصيل العملية بكلمات بدل JSON حيث أمكن */
function describe(details: Record<string, unknown>): string {
  const d = details ?? {};
  const parts: string[] = [];
  const add = (label: string, key: string) => {
    const v = d[key];
    if (v !== undefined && v !== null && String(v) !== "") parts.push(`${label}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  };
  add("الباقة", "plan");
  add("من", "from");
  add("إلى", "to");
  add("الأيام", "days");
  add("الدورة", "billing_cycle");
  add("الفترات", "periods");
  add("المبلغ", "amount");
  add("الإجمالي", "total");
  add("الفاتورة", "invoice");
  add("الطريقة", "method");
  add("السبب", "reason");
  add("ملاحظة", "note");
  add("البريد", "email");
  add("الرمز", "code");
  add("العنوان", "title");
  for (const key of ["trial_ends_at", "period_end"]) {
    const v = d[key];
    if (typeof v === "string") parts.push(`حتى: ${formatDate(v)}`);
  }
  if (parts.length) return parts.join("، ");
  return Object.keys(d).length ? JSON.stringify(d) : "";
}

export default function AuditTable({ rows, showCompany }: { rows: AuditRow[]; showCompany: boolean }) {
  const { go } = useShell();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>الوقت</th>
            {showCompany ? <th>المنشأة</th> : null}
            <th>العملية</th>
            <th>بواسطة</th>
            <th>تفاصيل</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={showCompany ? 5 : 4}><Empty>لا توجد عمليات.</Empty></td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td className="nowrap">{formatDate(row.created_at)}</td>
              {showCompany ? (
                <td>
                  {row.company_id ? (
                    <button type="button" className="link" onClick={() => go(`company/${row.company_id}/audit`)}>
                      {row.company_code} — {row.company_name ?? ""}
                    </button>
                  ) : "—"}
                </td>
              ) : null}
              <td>{ACTION_LABELS[row.action] ?? row.action}</td>
              <td dir="ltr">{row.actor_email || "—"}</td>
              <td className="details">{describe(row.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
