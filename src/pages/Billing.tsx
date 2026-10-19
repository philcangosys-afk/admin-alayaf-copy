import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorText, formatDay, INVOICE_STATUS, money, paymentMethodLabel, type Invoice, type Payment } from "../api";
import { useShell } from "../shell";
import { PrinterIcon } from "../components/Icons";
import { printInvoice } from "../components/printInvoice";
import { Empty, useToast } from "../components/Ui";

type View = "invoices" | "payments";
type InvoiceFilter = "all" | "issued" | "paid" | "void";

/** خلية CSV: الأرقام كما هي، والنص بين علامتي تنصيص، والنص الذي يبدأ بـ = + - @ يُسبق بـ ' حتى لا يُنفَّذ صيغةً في Excel */
const csvCell = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
function downloadCsv(name: string, header: string[], rows: unknown[][]) {
  const text = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** فواتير المنصة ومدفوعاتها لكل المنشآت (الإدارة التفصيلية من صفحة كل منشأة) */
export default function Billing() {
  const toast = useToast();
  const { go, tick } = useShell();
  const [view, setView] = useState<View>("invoices");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      if (view === "invoices") setInvoices(await api.listInvoices(filter));
      else setPayments(await api.listPayments());
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [view, filter, toast]);

  useEffect(() => { void load(); }, [load, tick]);

  const term = search.trim().toLowerCase();
  const shownInvoices = useMemo(
    () => (term ? invoices.filter((i) => [i.number, i.company_name, i.company_code, i.description].some((v) => String(v ?? "").toLowerCase().includes(term))) : invoices),
    [invoices, term],
  );
  const shownPayments = useMemo(
    () => (term ? payments.filter((p) => [p.company_name, p.company_code, p.reference, p.invoice_number].some((v) => String(v ?? "").toLowerCase().includes(term))) : payments),
    [payments, term],
  );
  const totals = useMemo(() => {
    const live = shownInvoices.filter((i) => i.status !== "void");
    return {
      total: live.reduce((s, i) => s + Number(i.total), 0),
      paid: live.reduce((s, i) => s + Number(i.paid_amount), 0),
      received: shownPayments.filter((p) => !p.voided_at).reduce((s, p) => s + Number(p.amount), 0),
    };
  }, [shownInvoices, shownPayments]);

  const exportCsv = () => {
    if (view === "invoices") {
      downloadCsv(
        `platform-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
        ["الرقم", "المنشأة", "رقم المنشأة", "الوصف", "التاريخ", "قبل الضريبة", "الخصم", "الضريبة", "الإجمالي", "المدفوع", "الحالة"],
        shownInvoices.map((i) => [i.number, i.company_name, i.company_code, i.description, i.issued_at.slice(0, 10), Number(i.subtotal), Number(i.discount), Number(i.vat_amount), Number(i.total), Number(i.paid_amount), INVOICE_STATUS[i.status]]),
      );
    } else {
      downloadCsv(
        `platform-payments-${new Date().toISOString().slice(0, 10)}.csv`,
        ["التاريخ", "المنشأة", "رقم المنشأة", "المبلغ", "الطريقة", "المرجع", "الفاتورة", "ملغاة"],
        shownPayments.map((p) => [p.received_at, p.company_name, p.company_code, Number(p.amount), paymentMethodLabel(p.method), p.reference, p.invoice_number ?? "", p.voided_at ? "نعم" : ""]),
      );
    }
  };

  return (
    <section className="card">
      <div className="toolbar">
        <div className="chips">
          <button type="button" className={`chip ${view === "invoices" ? "active" : ""}`} onClick={() => setView("invoices")}>الفواتير</button>
          <button type="button" className={`chip ${view === "payments" ? "active" : ""}`} onClick={() => setView("payments")}>المدفوعات</button>
          {view === "invoices" ? (
            <>
              <span className="muted small" style={{ alignSelf: "center", padding: "0 6px" }}>|</span>
              {(["all", "issued", "paid", "void"] as InvoiceFilter[]).map((f) => (
                <button key={f} type="button" className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {f === "all" ? "كل الحالات" : INVOICE_STATUS[f]}
                </button>
              ))}
            </>
          ) : null}
        </div>
        <div className="row">
          <input className="search" placeholder="بحث بالمنشأة أو الرقم أو المرجع" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="button" className="btn" onClick={exportCsv}>تصدير CSV</button>
        </div>
      </div>
      <div className="table-wrap">
        {view === "invoices" ? (
          <table className="table">
            <thead>
              <tr><th>الرقم</th><th>المنشأة</th><th>الوصف</th><th>التاريخ</th><th className="num">الإجمالي</th><th className="num">المدفوع</th><th>الحالة</th><th /></tr>
            </thead>
            <tbody>
              {shownInvoices.length === 0 ? (
                <tr><td colSpan={8}><Empty>لا فواتير.</Empty></td></tr>
              ) : shownInvoices.map((i) => (
                <tr key={i.id} className={i.status === "void" ? "voided" : ""}>
                  <td className="mono" dir="ltr">{i.number}</td>
                  <td className="keep"><button type="button" className="link" onClick={() => go(`company/${i.company_id}/billing`)}>{i.company_name}</button></td>
                  <td>{i.description}</td>
                  <td className="nowrap">{formatDay(i.issued_at)}</td>
                  <td className="num">{money(i.total)}</td>
                  <td className="num">{money(i.paid_amount)}</td>
                  <td className="keep"><span className={`pill ${i.status === "paid" ? "pill-ok" : i.status === "void" ? "pill-muted" : "pill-warn"}`}>{INVOICE_STATUS[i.status]}</span></td>
                  <td className="keep">
                    <div className="actions">
                      <button type="button" className="btn btn-sm" onClick={() => { if (!printInvoice(i)) toast("error", "اسمح بالنوافذ المنبثقة للطباعة"); }}><PrinterIcon /> طباعة</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {shownInvoices.length ? (
              <tfoot>
                <tr>
                  <td colSpan={4} className="muted">المجموع (بلا الملغاة)</td>
                  <td className="num"><b>{money(totals.total)}</b></td>
                  <td className="num"><b>{money(totals.paid)}</b></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        ) : (
          <table className="table">
            <thead>
              <tr><th>التاريخ</th><th>المنشأة</th><th className="num">المبلغ</th><th>الطريقة</th><th>المرجع</th><th>الفاتورة</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              {shownPayments.length === 0 ? (
                <tr><td colSpan={7}><Empty>لا مدفوعات.</Empty></td></tr>
              ) : shownPayments.map((p) => (
                <tr key={p.id} className={p.voided_at ? "voided" : ""}>
                  <td className="nowrap">{formatDay(p.received_at)}</td>
                  <td className="keep"><button type="button" className="link" onClick={() => go(`company/${p.company_id}/billing`)}>{p.company_name}</button></td>
                  <td className="num">{money(p.amount)}</td>
                  <td>{paymentMethodLabel(p.method)}</td>
                  <td dir="ltr">{p.reference || "—"}</td>
                  <td className="mono" dir="ltr">{p.invoice_number ?? "—"}</td>
                  <td className="keep">{p.voided_at ? <span className="pill pill-muted">ملغاة</span> : <span className="pill pill-ok">مستلمة</span>}</td>
                </tr>
              ))}
            </tbody>
            {shownPayments.length ? (
              <tfoot>
                <tr>
                  <td colSpan={2} className="muted">المستلم (بلا الملغاة)</td>
                  <td className="num"><b>{money(totals.received)}</b></td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        )}
      </div>
    </section>
  );
}
