import { useCallback, useEffect, useState } from "react";
import {
  api, countryName, daysText, errorText, formatDate, formatDay, INVOICE_STATUS, money, paymentMethodLabel, STATE_LABELS,
  type AuditRow, type CompanyDetails, type EditableCompany, type Invoice, type MemberRow, type Payment, type SubscriptionDetails,
} from "../api";
import { useShell } from "../shell";
import AuditTable from "./AuditTable";
import { CompanyActionButtons, useCompanyAction } from "./Companies";
import { CompanyFields, validateCompany } from "./CompanyForm";
import {
  BanIcon, CalendarPlusIcon, CheckCircleIcon, CoinsIcon, FileIcon, GiftIcon, LockIcon, PrinterIcon, ReceiptIcon, SwapIcon,
} from "./Icons";
import { printInvoice } from "./printInvoice";
import {
  ActivateDialog, AdjustmentDialog, ChangePlanDialog, ExtendDialog, InvoiceDialog, PaymentDialog, StatusDialog, type StatusAction,
} from "./SubscriptionDialogs";
import { ConfirmDialog, Empty, Meter, StatePill, StatusBadge, TextArea, useToast } from "./Ui";

type Tab = "overview" | "details" | "billing" | "members" | "audit";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "الاشتراك" },
  { id: "billing", label: "الفوترة والرصيد" },
  { id: "details", label: "بيانات المنشأة" },
  { id: "members", label: "المستخدمون" },
  { id: "audit", label: "سجل العمليات" },
];

const pickEditable = (company: CompanyDetails): EditableCompany => ({
  name_ar: company.name_ar ?? "",
  name_en: company.name_en ?? "",
  vat_number: company.vat_number ?? "",
  cr_number: company.cr_number ?? "",
  phone: company.phone ?? "",
  email: company.email ?? "",
  city: company.city ?? "",
  region: company.region ?? "",
  address_ar: company.address_ar ?? "",
  address_en: company.address_en ?? "",
  bank_name: company.bank_name ?? "",
  iban: company.iban ?? "",
  contact_name: company.contact_name ?? "",
  employee_email_domain: company.employee_email_domain ?? "",
});

/** حلقة الأيام المتبقية */
function Ring({ sub }: { sub: SubscriptionDetails }) {
  const locked = sub.access === "read_only";
  const days = Math.max(0, Number(sub.days_left ?? 0));
  const isTrial = sub.status === "trialing";
  const start = isTrial ? sub.trial_started_at : sub.current_period_start;
  const end = isTrial ? sub.trial_ends_at : sub.current_period_end;
  const total = start && end ? Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)) : Math.max(1, days);
  const ratio = locked ? 0 : Math.min(1, days / total);
  const r = 42;
  const c = 2 * Math.PI * r;
  const color = locked ? "#b42318" : sub.state === "complimentary" ? "#c9a24d" : days <= 2 ? "#a8640b" : "#127a5a";
  return (
    <div className="ring">
      <svg viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#ebf1ee" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={sub.state === "complimentary" ? 0 : c * (1 - ratio)} />
      </svg>
      <div className="ring-text">
        {sub.state === "complimentary" ? (
          <><b style={{ color }}>∞</b><span>بلا انتهاء</span></>
        ) : (
          <><b style={{ color }}>{locked ? 0 : days}</b><span>{locked ? "قراءة فقط" : days === 1 ? "يوم متبقٍ" : days === 2 ? "يومان متبقيان" : days <= 10 ? "أيام متبقية" : "يومًا متبقيًا"}</span></>
        )}
      </div>
    </div>
  );
}

type Dialog =
  | { kind: "extend" }
  | { kind: "plan" }
  | { kind: "activate"; plan?: string; cycle?: "monthly" | "yearly" }
  | { kind: "status"; action: StatusAction }
  | { kind: "invoice" }
  | { kind: "payment" }
  | { kind: "adjust" }
  | { kind: "void-invoice"; invoice: Invoice }
  | { kind: "void-payment"; payment: Payment }
  | { kind: "close-request"; requestId: string }
  | { kind: "legal"; merged: EditableCompany }
  | { kind: "member"; member: MemberRow; action: "disable" | "enable" | "remove" }
  | null;

/** صفحة المنشأة: الاشتراك وإجراءاته، والفوترة والرصيد، والبيانات، والمستخدمون، والسجل */
export default function CompanyPage({ companyId, tab }: { companyId: string; tab: string }) {
  const toast = useToast();
  const { go, tick, reloadStats } = useShell();
  const active: Tab = (TABS.some((t) => t.id === tab) ? tab : "overview") as Tab;
  const [company, setCompany] = useState<CompanyDetails | null>(null);
  const [sub, setSub] = useState<SubscriptionDetails | null>(null);
  const [subError, setSubError] = useState("");
  const [draft, setDraft] = useState<EditableCompany | null>(null);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [notes, setNotes] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);

  const loadCompany = useCallback(async () => {
    try {
      const details = await api.getCompany(companyId);
      setCompany(details);
      setDraft(pickEditable(details));
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [companyId, toast]);

  const loadSub = useCallback(async () => {
    try {
      const next = await api.getSubscription(companyId);
      setSub(next);
      setNotes(next.notes ?? "");
      setSubError("");
    } catch (error) {
      setSubError(errorText(error));
    }
  }, [companyId]);

  useEffect(() => { void loadCompany(); void loadSub(); }, [loadCompany, loadSub, tick]);
  useEffect(() => {
    if (active === "members") api.listMembers(companyId).then(setMembers).catch((e) => toast("error", errorText(e)));
    if (active === "audit") api.audit(companyId, 300).then(setAudit).catch((e) => toast("error", errorText(e)));
  }, [active, companyId, toast, tick]);

  const { dialog: statusDialog, open: openCompanyAction } = useCompanyAction(() => { void loadCompany(); void loadSub(); });

  const applySub = (next: SubscriptionDetails) => {
    setSub(next);
    setNotes(next.notes ?? "");
    void reloadStats();
  };

  /* ── حفظ البيانات: الحقول المتغيّرة فقط فوق أحدث نسخة ── */
  const save = async (confirmed?: EditableCompany) => {
    if (!draft || !company) return;
    let merged = confirmed;
    if (!merged) {
      const problem = validateCompany(draft, company.country);
      if (problem) {
        toast("error", problem);
        return;
      }
      const loaded = pickEditable(company);
      const changedKeys = (Object.keys(draft) as Array<keyof EditableCompany>).filter((key) => draft[key].trim() !== loaded[key].trim());
      if (!changedKeys.length) {
        toast("ok", "لا توجد تغييرات للحفظ");
        return;
      }
      try {
        const fresh = pickEditable(await api.getCompany(company.id));
        merged = { ...fresh };
        for (const key of changedKeys) merged[key] = draft[key];
      } catch (error) {
        toast("error", errorText(error));
        return;
      }
      merged.iban = merged.iban.replace(/\s+/g, "").toUpperCase();
      merged.employee_email_domain = merged.employee_email_domain.trim().toLowerCase();
      const legal = changedKeys.some((key) => key === "name_ar" || key === "vat_number" || key === "cr_number");
      if (legal && company.status === "active") {
        setDialog({ kind: "legal", merged });
        return;
      }
    }
    setSaving(true);
    try {
      await api.updateCompany(company.id, merged);
      toast("ok", "تم حفظ بيانات المنشأة");
      await loadCompany();
    } catch (error) {
      toast("error", errorText(error));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const runMemberAction = async (member: MemberRow, action: "disable" | "enable" | "remove") => {
    try {
      if (action === "remove") {
        await api.removeMember(member.user_id);
        toast("ok", "أُزيل العضو من المنشأة");
      } else {
        const result = await api.setMemberStatus(member.user_id, action === "disable" ? "disabled" : "active");
        toast("ok", result === "removed" ? "لا يوجد ربط فعال للعضو في المنشأة؛ أُزيلت عضويته" : action === "disable" ? "عُطّل العضو" : "فُعّل العضو");
      }
      setMembers(await api.listMembers(companyId));
      void loadSub();
    } catch (error) {
      toast("error", errorText(error));
      throw error;
    }
  };

  if (!company || !draft) {
    return <div className="card card-pad muted">جاري التحميل...</div>;
  }

  const hasSub = Boolean(sub && sub.state !== "none");
  const openRequest = (sub?.requests ?? []).find((r) => r.status === "open");
  const isTrial = sub?.status === "trialing";
  const endDate = isTrial ? sub?.trial_ends_at : sub?.current_period_end;
  const currency = sub?.currency ?? "SAR";
  // «إرجاع إلى مشترك» يقبله الخادم فقط لفترة سارية أو في مهلتها
  const restorable = Boolean(
    sub?.current_period_end && new Date(sub.current_period_end).getTime() + (sub.grace_days ?? 0) * 86_400_000 >= Date.now(),
  );

  return (
    <>
      <div className="company-head">
        <div>
          <h2>{company.name_ar}</h2>
          <div className="meta">
            <span>رقم <b className="mono">{company.code}</b></span>
            <span>{countryName(company.country)}{company.region ? `، ${company.region}` : ""}</span>
            <span dir="ltr">{company.owner_email || "—"}</span>
            <span>{company.owner_user_id ? "صاحبها دخل وارتبط" : "صاحبها لم يدخل بعد"}</span>
            <span>أُنشئت {formatDay(company.created_at)}</span>
          </div>
        </div>
        <div className="row">
          <StatusBadge status={company.status} />
          {sub && sub.state !== "none" ? <StatePill state={sub.state} /> : null}
          <CompanyActionButtons company={company} status={company.status} open={openCompanyAction} />
        </div>
      </div>
      {company.status_reason && company.status !== "active" ? <div className="notice warn">السبب: {company.status_reason}</div> : null}

      <nav className="tabs" aria-label="أقسام المنشأة">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={active === t.id ? "active" : ""} onClick={() => go(`company/${companyId}/${t.id}`)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ═══ الاشتراك ═══ */}
      {active === "overview" ? (
        subError ? (
          <div className="notice warn">{subError}</div>
        ) : !sub ? (
          <div className="card card-pad muted">جاري التحميل...</div>
        ) : !hasSub ? (
          <div className="card card-pad">
            <p className="muted" style={{ margin: 0 }}>
              {company.status === "pending"
                ? "لا اشتراك قبل الموافقة. عند الموافقة تبدأ الفترة التجريبية المجانية تلقائيًا."
                : "لا اشتراك لهذه المنشأة. يبدأ عند تفعيلها (الموافقة أو إعادة التفعيل)."}
            </p>
          </div>
        ) : (
          <div className="sub-panel">
            <div className="card">
              <div className="sub-status">
                <Ring sub={sub} />
                <dl className="kv" style={{ flex: 1 }}>
                  <div><dt>الباقة</dt><dd>{sub.plan?.name_ar ?? "—"}</dd></div>
                  <div><dt>الحالة</dt><dd>{STATE_LABELS[sub.state]}</dd></div>
                  <div><dt>{isTrial ? "نهاية التجربة" : "نهاية الفترة"}</dt><dd>{formatDate(endDate)}</dd></div>
                  <div>
                    <dt>{isTrial ? "بدأت التجربة" : "الدورة"}</dt>
                    <dd>{isTrial ? formatDay(sub.trial_started_at) : sub.status === "complimentary" ? "مجاني" : sub.billing_cycle === "yearly" ? "سنوية" : "شهرية"}</dd>
                  </div>
                  {sub.price_override !== null && sub.price_override !== undefined ? (
                    <div><dt>سعر خاص</dt><dd className="num" style={{ textAlign: "right" }}>{money(sub.price_override)} {currency}</dd></div>
                  ) : null}
                  {sub.state === "grace" || sub.state === "past_due" ? (
                    <div><dt>مهلة السماح</dt><dd>{(sub.grace_days ?? 0) === 0 ? "بلا مهلة" : `${daysText(sub.grace_days ?? 0)} بعد نهاية الفترة`}</dd></div>
                  ) : null}
                </dl>
              </div>
              <div className="action-grid">
                <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "activate" })}>
                  <CheckCircleIcon /> تفعيل أو تجديد اشتراك
                </button>
                {sub.status !== "complimentary" ? (
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "extend" })}>
                    <CalendarPlusIcon /> {sub.current_period_end ? "تمديد الفترة بأيام" : "تمديد التجربة بأيام"}
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={() => setDialog({ kind: "plan" })}>
                  <SwapIcon /> تغيير الباقة
                </button>
                {sub.status !== "read_only" ? (
                  <button type="button" className="btn btn-danger" onClick={() => setDialog({ kind: "status", action: "read_only" })}>
                    <LockIcon /> قراءة فقط الآن
                  </button>
                ) : restorable ? (
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "status", action: "active" })}>
                    <CheckCircleIcon /> إرجاع إلى «مشترك»
                  </button>
                ) : null}
                {sub.status !== "complimentary" ? (
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "status", action: "complimentary" })}>
                    <GiftIcon /> مجاني دائم
                  </button>
                ) : null}
                {sub.current_period_end && new Date(sub.current_period_end).getTime() > Date.now() && (sub.status === "active" || sub.status === "past_due") ? (
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "status", action: "cancelled" })}>
                    <BanIcon /> إيقاف التجديد
                  </button>
                ) : null}
                {restorable && sub.status === "active" ? (
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "status", action: "past_due" })}>
                    <CoinsIcon /> متأخر السداد
                  </button>
                ) : null}
                {restorable && (sub.status === "cancelled" || sub.status === "past_due" || sub.status === "complimentary") ? (
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "status", action: "active" })}>
                    <CheckCircleIcon /> إرجاع إلى «مشترك»
                  </button>
                ) : null}
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h2>الاستخدام مقابل الباقة</h2></div>
              <div className="card-pad" style={{ display: "grid", gap: 14 }}>
                <Meter label="المستخدمون" used={sub.usage?.users ?? 0} limit={sub.plan?.max_users} />
                <Meter label="الموظفون الفعّالون" used={sub.usage?.employees ?? 0} limit={sub.plan?.max_employees} />
                <Meter label="الفروع" used={sub.usage?.branches ?? 0} limit={sub.plan?.max_branches} />
                <div className="meter-top"><span>فواتير المبيعات</span><b>{sub.usage?.sales_invoices ?? 0}</b></div>
              </div>
              <div className="balance">
                <span className="muted">رصيد المنشأة لدى المنصة</span>
                <b className={Number(sub.balance ?? 0) > 0 ? "danger-text" : "ok-text"}>{money(sub.balance)} <small className="muted">{currency}</small></b>
              </div>
            </div>

            {openRequest ? (
              <div className="card" style={{ gridColumn: "1 / -1" }}>
                <div className="card-head">
                  <h2>طلب اشتراك من المنشأة</h2>
                  <span className="sub">{formatDate(openRequest.created_at)}</span>
                </div>
                <div className="card-pad">
                  <p style={{ margin: 0 }}>
                    باقة <b>{openRequest.plan_name}</b>، دورة <b>{openRequest.billing_cycle === "yearly" ? "سنوية" : "شهرية"}</b>
                    {openRequest.note ? <> — «{openRequest.note}»</> : null}
                  </p>
                  <div className="row-end" style={{ marginTop: 10 }}>
                    <button type="button" className="btn" onClick={() => setDialog({ kind: "close-request", requestId: openRequest.id })}>إغلاق بلا تفعيل</button>
                    <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "activate", plan: openRequest.plan_code, cycle: openRequest.billing_cycle })}>
                      تفعيل حسب الطلب
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-head"><h2>ملاحظات داخلية</h2><span className="sub">لا تظهر للمنشأة</span></div>
              <div className="card-pad">
                <TextArea label="الملاحظات" value={notes} onChange={setNotes} rows={3} maxLength={2000} />
                <div className="row-end">
                  <button
                    type="button"
                    className="btn"
                    disabled={notes === (sub.notes ?? "")}
                    onClick={() => api.saveNotes(companyId, notes).then(() => { toast("ok", "حُفظت الملاحظات"); void loadSub(); }).catch((e) => toast("error", errorText(e)))}
                  >
                    حفظ الملاحظات
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      ) : null}

      {/* ═══ الفوترة ═══ */}
      {active === "billing" ? (
        !sub ? (
          <div className="notice warn">{subError || "جاري التحميل..."}</div>
        ) : (
          <>
            <div className="card">
              <div className="balance" style={{ borderTop: 0 }}>
                <div>
                  <div className="muted small">الرصيد = الفواتير + التسويات − المدفوعات</div>
                  <b className={Number(sub.balance ?? 0) > 0 ? "danger-text" : "ok-text"}>{money(sub.balance)} <small className="muted">{currency}</small></b>
                </div>
                <div className="row">
                  <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "payment" })}><CoinsIcon /> تسجيل دفعة</button>
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "invoice" })}><ReceiptIcon /> إصدار فاتورة</button>
                  <button type="button" className="btn" onClick={() => setDialog({ kind: "adjust" })}><FileIcon /> تسوية رصيد</button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h2>الفواتير</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>الرقم</th><th>الوصف</th><th>التاريخ</th><th className="num">الإجمالي</th><th className="num">المدفوع</th><th>الحالة</th><th /></tr>
                  </thead>
                  <tbody>
                    {(sub.invoices ?? []).length === 0 ? (
                      <tr><td colSpan={7}><Empty>لا فواتير بعد. تصدر الفاتورة مع «تفعيل اشتراك» أو من «إصدار فاتورة».</Empty></td></tr>
                    ) : (sub.invoices ?? []).map((invoice) => (
                      <tr key={invoice.id} className={invoice.status === "void" ? "voided" : ""}>
                        <td className="mono" dir="ltr">{invoice.number}</td>
                        <td>{invoice.description}{invoice.status === "void" && invoice.void_reason ? <div className="sub">{invoice.void_reason}</div> : null}</td>
                        <td className="nowrap">{formatDay(invoice.issued_at)}</td>
                        <td className="num">{money(invoice.total)}</td>
                        <td className="num">{money(invoice.paid_amount)}</td>
                        <td className="keep"><span className={`pill ${invoice.status === "paid" ? "pill-ok" : invoice.status === "void" ? "pill-muted" : "pill-warn"}`}>{INVOICE_STATUS[invoice.status]}</span></td>
                        <td className="keep">
                          <div className="actions">
                            <button type="button" className="btn btn-sm" onClick={() => { if (!printInvoice(invoice, currency)) toast("error", "اسمح بالنوافذ المنبثقة للطباعة"); }}>
                              <PrinterIcon /> طباعة
                            </button>
                            {invoice.status !== "void" ? (
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => setDialog({ kind: "void-invoice", invoice })}>إلغاء</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-head"><h2>المدفوعات</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>التاريخ</th><th className="num">المبلغ</th><th>الطريقة</th><th>المرجع</th><th>الفاتورة</th><th /></tr>
                  </thead>
                  <tbody>
                    {(sub.payments ?? []).length === 0 ? (
                      <tr><td colSpan={6}><Empty>لا مدفوعات مسجّلة.</Empty></td></tr>
                    ) : (sub.payments ?? []).map((payment) => (
                      <tr key={payment.id} className={payment.voided_at ? "voided" : ""}>
                        <td className="nowrap">{formatDay(payment.received_at)}</td>
                        <td className="num">{money(payment.amount)}</td>
                        <td>{paymentMethodLabel(payment.method)}</td>
                        <td dir="ltr">{payment.reference || "—"}{payment.voided_at && payment.void_reason ? <div className="sub" dir="rtl">{payment.void_reason}</div> : null}</td>
                        <td className="mono" dir="ltr">{payment.invoice_number ?? "—"}</td>
                        <td className="keep">
                          <div className="actions">
                            {!payment.voided_at ? (
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => setDialog({ kind: "void-payment", payment })}>إلغاء</button>
                            ) : <span className="pill pill-muted">ملغاة</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {(sub.adjustments ?? []).length ? (
              <div className="card">
                <div className="card-head"><h2>التسويات</h2></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>التاريخ</th><th className="num">المبلغ</th><th>السبب</th></tr></thead>
                    <tbody>
                      {(sub.adjustments ?? []).map((a) => (
                        <tr key={a.id}>
                          <td className="nowrap">{formatDate(a.created_at)}</td>
                          <td className={`num ${a.amount < 0 ? "ok-text" : "danger-text"}`}>{money(a.amount)}</td>
                          <td>{a.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {/* ═══ البيانات ═══ */}
      {active === "details" ? (
        <section className="card card-pad">
          <div className="notice info">
            الدولة: <b>{countryName(company.country)}</b> (لا تتغير بعد الإنشاء). تغيير الاسم أو الرقم الضريبي أو السجل يغيّر ما يُطبع على فواتير المنشأة.
          </div>
          <CompanyFields values={draft} onChange={setDraft} country={company.country} disabled={saving} />
          <div className="row-end">
            <button type="button" className="btn" onClick={() => setDraft(pickEditable(company))} disabled={saving}>تراجع</button>
            <button type="button" className="btn btn-primary" onClick={() => void save().catch(() => undefined)} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ البيانات"}
            </button>
          </div>
        </section>
      ) : null}

      {/* ═══ المستخدمون ═══ */}
      {active === "members" ? (
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>البريد</th><th>النوع</th><th>الحالة</th><th>منذ</th><th /></tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={5}><Empty>لا يوجد مستخدمون مرتبطون بعد.</Empty></td></tr>
                ) : members.map((member) => (
                  <tr key={member.user_id}>
                    <td dir="ltr">{member.email ?? member.user_id}</td>
                    <td>{member.member_role === "owner" ? "صاحب المنشأة" : "مستخدم"}</td>
                    <td>{member.status === "active" ? <span className="pill pill-ok">فعال</span> : <span className="pill pill-danger">معطّل</span>}</td>
                    <td className="nowrap">{formatDate(member.created_at)}</td>
                    <td>
                      <div className="actions">
                        {member.status === "active" ? (
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => setDialog({ kind: "member", member, action: "disable" })}>تعطيل</button>
                        ) : (
                          <>
                            <button type="button" className="btn btn-sm" onClick={() => setDialog({ kind: "member", member, action: "enable" })}>تفعيل</button>
                            {member.member_role === "member" ? (
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => setDialog({ kind: "member", member, action: "remove" })}>إزالة</button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {active === "audit" ? <section className="card"><AuditTable rows={audit} showCompany={false} /></section> : null}

      {/* ═══ النوافذ ═══ */}
      {dialog?.kind === "extend" && sub ? <ExtendDialog companyId={companyId} sub={sub} onClose={() => setDialog(null)} onDone={applySub} /> : null}
      {dialog?.kind === "plan" && sub ? <ChangePlanDialog companyId={companyId} sub={sub} onClose={() => setDialog(null)} onDone={applySub} /> : null}
      {dialog?.kind === "activate" && sub ? (
        <ActivateDialog companyId={companyId} sub={sub} initialPlan={dialog.plan} initialCycle={dialog.cycle} onClose={() => setDialog(null)} onDone={applySub} />
      ) : null}
      {dialog?.kind === "status" ? <StatusDialog companyId={companyId} action={dialog.action} onClose={() => setDialog(null)} onDone={applySub} /> : null}
      {dialog?.kind === "invoice" ? <InvoiceDialog companyId={companyId} vatRate={Number(sub?.vat_rate ?? 15)} onClose={() => setDialog(null)} onDone={applySub} /> : null}
      {dialog?.kind === "payment" ? <PaymentDialog companyId={companyId} invoices={sub?.invoices ?? []} onClose={() => setDialog(null)} onDone={applySub} /> : null}
      {dialog?.kind === "adjust" ? <AdjustmentDialog companyId={companyId} onClose={() => setDialog(null)} onDone={applySub} /> : null}
      {dialog?.kind === "void-invoice" ? (
        <ConfirmDialog
          title={`إلغاء الفاتورة ${dialog.invoice.number}`}
          message="تبقى الفاتورة في السجل بحالة «ملغاة» ويُطرح مبلغها من رصيد المنشأة. الفاتورة التي عليها دفعات لا تُلغى قبل إلغاء دفعاتها."
          confirmLabel="إلغاء الفاتورة"
          danger
          needReason
          reasonLabel="سبب الإلغاء (داخلي)"
          onConfirm={async (reason) => {
            try { applySub(await api.voidInvoice(dialog.invoice.id, reason)); toast("ok", "أُلغيت الفاتورة"); } catch (e) { toast("error", errorText(e)); throw e; }
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "void-payment" ? (
        <ConfirmDialog
          title="إلغاء دفعة"
          message={`دفعة ${money(dialog.payment.amount)} بتاريخ ${formatDay(dialog.payment.received_at)}. يزيد رصيد المنشأة بمبلغها، وتعود فاتورتها «غير مدفوعة» إن لم يكتمل مبلغها.`}
          confirmLabel="إلغاء الدفعة"
          danger
          needReason
          reasonLabel="سبب الإلغاء (داخلي)"
          onConfirm={async (reason) => {
            try { applySub(await api.voidPayment(dialog.payment.id, reason)); toast("ok", "أُلغيت الدفعة"); } catch (e) { toast("error", errorText(e)); throw e; }
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "close-request" ? (
        <ConfirmDialog
          title="إغلاق طلب الاشتراك بلا تفعيل"
          message="يُغلق الطلب ولا يتغير الاشتراك. يظهر الرد في سجل الطلب."
          confirmLabel="إغلاق الطلب"
          needReason
          reasonLabel="الرد"
          onConfirm={async (reason) => {
            try { await api.resolveRequest(dialog.requestId, "cancelled", reason); toast("ok", "أُغلق الطلب"); await loadSub(); void reloadStats(); } catch (e) { toast("error", errorText(e)); throw e; }
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "legal" ? (
        <ConfirmDialog
          title="تغيير بيانات تظهر على الفواتير"
          message="تغيير الاسم أو الرقم الضريبي أو السجل التجاري يغيّر ما يُطبع على فواتير المنشأة، وقد يتطلب تجديد ربطها مع هيئة الزكاة والضريبة والجمارك. متابعة الحفظ؟"
          confirmLabel="حفظ التغييرات"
          onConfirm={() => save(dialog.merged)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "member" ? (
        <ConfirmDialog
          title={dialog.action === "disable" ? "تعطيل مستخدم" : dialog.action === "enable" ? "تفعيل مستخدم" : "إزالة مستخدم"}
          message={
            dialog.action === "disable"
              ? `سيُمنع ${dialog.member.email ?? ""} من الدخول إلى المنشأة، ولا تستطيع المنشأة إعادة تفعيله.`
              : dialog.action === "enable"
              ? `سيعود ${dialog.member.email ?? ""} للدخول إن كان مرتبطًا بموظف أو مستخدم خاص فعال في المنشأة.`
              : `ستُزال عضوية ${dialog.member.email ?? ""} نهائيًا ليمكن ربطه بمنشأة أخرى.`
          }
          confirmLabel={dialog.action === "disable" ? "تعطيل" : dialog.action === "enable" ? "تفعيل" : "إزالة"}
          danger={dialog.action !== "enable"}
          onConfirm={() => runMemberAction(dialog.member, dialog.action)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {statusDialog}
    </>
  );
}
