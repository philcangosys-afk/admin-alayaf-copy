import { formatDay, INVOICE_STATUS, money, type Invoice } from "../api";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);

/** طباعة مطالبة اشتراك المنصة في نافذة مستقلة (كل القيم مهرَّبة). بيانات المورّد والعميل لقطة وقت الإصدار.
 *  ليست فاتورة ضريبية إلكترونية حتى تُربط فواتير المنصة بالفوترة الإلكترونية للهيئة. */
export function printInvoice(invoice: Invoice, currency = "SAR"): boolean {
  const seller = invoice.seller ?? {};
  const buyer = invoice.buyer ?? {};
  const row = (label: string, value: unknown) =>
    value === null || value === undefined || String(value).trim() === "" ? "" : `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
  const unit = currency === "SAR" ? "ر.س" : currency;
  const amount = (n: number | string) => `${escapeHtml(money(n))} ${escapeHtml(unit)}`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(invoice.number)}</title>
<style>
body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;color:#0f2a21;margin:32px;font-size:13px}
h1{font-size:20px;margin:0 0 4px;color:#0b3d2e} .muted{color:#5e726a}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:22px 0}
.box{border:1px solid #dde7e2;border-radius:10px;padding:14px} .box h2{font-size:13px;margin:0 0 8px;color:#0b3d2e}
table{width:100%;border-collapse:collapse} th{text-align:right;color:#5e726a;font-weight:600;padding:3px 0;width:38%} td{padding:3px 0}
.lines th,.lines td{border-bottom:1px solid #ebf1ee;padding:8px 6px;width:auto} .lines thead th{background:#f3f6f4;color:#0b3d2e}
.num{text-align:left;font-variant-numeric:tabular-nums} .total td{font-weight:800;font-size:15px;color:#0b3d2e}
.status{display:inline-block;border-radius:999px;padding:2px 12px;background:#e8f3ee;color:#127a5a;font-weight:700}
.void{background:#fdecea;color:#b42318}
@media print{body{margin:12mm}}
</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
<div><h1>مطالبة اشتراك</h1><div class="muted">رقم ${escapeHtml(invoice.number)}، بتاريخ ${escapeHtml(formatDay(invoice.issued_at))}</div></div>
<span class="status ${invoice.status === "void" ? "void" : ""}">${escapeHtml(INVOICE_STATUS[invoice.status] ?? invoice.status)}</span></div>
<div class="grid">
<div class="box"><h2>المورّد</h2><table>${row("الاسم", seller.name_ar)}${row("الرقم الضريبي", seller.vat_number)}${row("السجل التجاري", seller.cr_number)}${row("العنوان", seller.address_ar)}${row("البنك", seller.bank_name)}${row("الآيبان", seller.iban)}</table></div>
<div class="box"><h2>العميل</h2><table>${row("المنشأة", buyer.name_ar)}${row("رقم المنشأة", buyer.code)}${row("الرقم الضريبي", buyer.vat_number)}${row("السجل التجاري", buyer.cr_number)}${row("العنوان", [buyer.address_ar, buyer.city, buyer.region].filter(Boolean).join("، "))}</table></div>
</div>
<table class="lines"><thead><tr><th>الوصف</th><th>الفترة</th><th class="num">المبلغ</th></tr></thead><tbody>
<tr><td>${escapeHtml(invoice.description)}</td><td>${escapeHtml(invoice.period_start ? `${formatDay(invoice.period_start)} – ${formatDay(invoice.period_end)}` : "—")}</td><td class="num">${amount(invoice.subtotal)}</td></tr>
${Number(invoice.discount) > 0 ? `<tr><td colspan="2">الخصم</td><td class="num">-${amount(invoice.discount)}</td></tr>` : ""}
<tr><td colspan="2">ضريبة القيمة المضافة (${escapeHtml(invoice.vat_rate)}%)</td><td class="num">${amount(invoice.vat_amount)}</td></tr>
<tr class="total"><td colspan="2">الإجمالي</td><td class="num">${amount(invoice.total)}</td></tr>
<tr><td colspan="2">المدفوع</td><td class="num">${amount(invoice.paid_amount ?? 0)}</td></tr>
</tbody></table>
<p class="muted" style="margin-top:22px">تاريخ الاستحقاق: ${escapeHtml(formatDay(invoice.due_at))}${invoice.status === "void" ? `، ملغاة: ${escapeHtml(invoice.void_reason)}` : ""}</p>
<p class="muted" style="margin-top:8px;font-size:12px">هذا المستند مطالبة بقيمة الاشتراك، وليس فاتورة ضريبية إلكترونية.</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const popup = window.open("", "_blank", "width=900,height=1000");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return true;
}
