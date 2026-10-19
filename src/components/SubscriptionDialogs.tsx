import { useEffect, useMemo, useState } from "react";
import {
  api, daysText, daysTextGen, errorText, formatDay, money, PAYMENT_METHODS, todayRiyadh,
  type ActivateInput, type Cycle, type Invoice, type Plan, type SubscriptionDetails,
} from "../api";
import { Field, Modal, SelectField, TextArea, useToast } from "./Ui";

type Done = (next: SubscriptionDetails) => void;

const addPeriod = (start: Date, cycle: Cycle, periods: number) => {
  const end = new Date(start);
  if (cycle === "yearly") end.setFullYear(end.getFullYear() + periods);
  else end.setMonth(end.getMonth() + periods);
  return end;
};

const parseAmount = (value: string) => {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
};

/** أساس التمديد (مثل الخادم): نهاية الفترة المدفوعة إن وُجدت، وإلا نهاية التجربة */
const currentEnd = (sub: SubscriptionDetails) => (sub.current_period_end ? sub.current_period_end : sub.trial_ends_at) ?? null;
/** أساس «بعد الحالية» في التفعيل (مثل الخادم): نهاية التجربة إن كانت الحالة «تجربة»، وإلا نهاية الفترة */
const activationBase = (sub: SubscriptionDetails) => (sub.status === "trialing" ? sub.trial_ends_at : sub.current_period_end) ?? null;
/** مبلغ بالهللات بلا أخطاء الكسور العشرية */
const toCents = (n: number) => Math.round(n * 100);

let plansCache: Plan[] | null = null;
function usePlans() {
  const [plans, setPlans] = useState<Plan[]>(plansCache ?? []);
  useEffect(() => {
    let active = true;
    api.listPlans().then((rows) => {
      plansCache = rows;
      if (active) setPlans(rows);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return plans;
}
export const invalidatePlans = () => { plansCache = null; };

/* ── التمديد بعدد أيام ── */
export function ExtendDialog({ companyId, sub, onClose, onDone }: { companyId: string; sub: SubscriptionDetails; onClose: () => void; onDone: Done }) {
  const toast = useToast();
  const [days, setDays] = useState("7");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const isTrial = !sub.current_period_end;
  const n = Math.trunc(Number(days));
  const valid = Number.isFinite(n) && n >= 1 && n <= 365;
  const base = Math.max(Date.now(), currentEnd(sub) ? new Date(currentEnd(sub) as string).getTime() : Date.now());
  const preview = valid ? new Date(base + n * 86_400_000) : null;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const next = await api.extend(companyId, n, note.trim());
      toast("ok", isTrial ? `مُدّدت التجربة ${daysTextGen(n)}` : `مُدّدت الفترة ${daysTextGen(n)}`);
      onDone(next);
      onClose();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isTrial ? "تمديد الفترة التجريبية" : "تمديد فترة الاشتراك"} onClose={busy ? () => undefined : onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        {isTrial
          ? "تُضاف الأيام إلى نهاية التجربة إن لم تنتهِ، ومن اليوم إن انتهت. ترجع المنشأة للعمل الكامل فورًا."
          : "تُضاف الأيام إلى نهاية الفترة المدفوعة إن لم تنتهِ، ومن اليوم إن انتهت. لا تُصدر فاتورة."}
      </p>
      <div className="chips" style={{ marginBottom: 10 }}>
        {[3, 7, 14, 30].map((d) => (
          <button key={d} type="button" className={`chip ${n === d ? "active" : ""}`} onClick={() => setDays(String(d))}>
            {daysText(d)}
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Field label="عدد الأيام" value={days} onChange={setDays} type="number" ltr required inputMode="numeric" hint="من 1 إلى 365" />
        <div className="field">
          <span>النهاية الجديدة</span>
          <div className="input" style={{ background: "#f7faf8" }}>{preview ? formatDay(preview.toISOString()) : "—"}</div>
        </div>
        <TextArea label="ملاحظة (في سجل العمليات)" value={note} onChange={setNote} rows={2} maxLength={500} className="span-2" />
      </div>
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !valid}>
          {busy ? "جاري التمديد..." : `تمديد ${valid ? daysTextGen(n) : ""}`}
        </button>
      </div>
    </Modal>
  );
}

/* ── تغيير الباقة ── */
export function ChangePlanDialog({ companyId, sub, onClose, onDone }: { companyId: string; sub: SubscriptionDetails; onClose: () => void; onDone: Done }) {
  const toast = useToast();
  const plans = usePlans().filter((p) => p.is_active);
  const [code, setCode] = useState(sub.plan?.code ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const target = plans.find((p) => p.code === code);
  const over = target && sub.usage
    ? [
        target.max_users !== null && sub.usage.users > target.max_users ? `المستخدمون ${sub.usage.users} من ${target.max_users}` : "",
        target.max_employees !== null && sub.usage.employees > target.max_employees ? `الموظفون ${sub.usage.employees} من ${target.max_employees}` : "",
        target.max_branches !== null && sub.usage.branches > target.max_branches ? `الفروع ${sub.usage.branches} من ${target.max_branches}` : "",
      ].filter(Boolean)
    : [];

  const submit = async () => {
    setBusy(true);
    try {
      const next = await api.changePlan(companyId, code, note.trim());
      toast("ok", `صارت الباقة: ${target?.name_ar ?? code}`);
      onDone(next);
      onClose();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="تغيير الباقة" onClose={busy ? () => undefined : onClose}>
      <p className="muted" style={{ marginTop: 0 }}>تتغير حدود المنشأة فورًا، ولا تتغير التواريخ ولا تُصدر فاتورة. للترقية المدفوعة استخدم «تفعيل اشتراك».</p>
      <SelectField
        label="الباقة"
        value={code}
        onChange={setCode}
        options={plans.map((p) => ({ value: p.code, label: `${p.name_ar} — ${money(p.price_monthly)} شهريًا` }))}
      />
      {over.length ? (
        <p className="notice warn" style={{ marginTop: 12 }}>
          الاستخدام الحالي فوق حدود هذه الباقة ({over.join("، ")}). لا يُحذف شيء، لكن لن تستطيع المنشأة إضافة المزيد حتى تنزل تحت الحد.
        </p>
      ) : null}
      <TextArea label="ملاحظة (في سجل العمليات)" value={note} onChange={setNote} rows={2} maxLength={500} />
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !code || code === sub.plan?.code}>
          {busy ? "جاري الحفظ..." : "تغيير الباقة"}
        </button>
      </div>
    </Modal>
  );
}

/* ── التفعيل اليدوي: باقة ودورة وفترات، وفاتورة ودفعة اختياريتان ── */
export function ActivateDialog({
  companyId,
  sub,
  initialPlan,
  initialCycle,
  onClose,
  onDone,
}: {
  companyId: string;
  sub: SubscriptionDetails;
  initialPlan?: string;
  initialCycle?: Cycle;
  onClose: () => void;
  onDone: Done;
}) {
  const toast = useToast();
  const plans = usePlans().filter((p) => p.is_active);
  const ongoing = Boolean(activationBase(sub) && new Date(activationBase(sub) as string).getTime() > Date.now());
  const [form, setForm] = useState<ActivateInput>({
    plan_code: initialPlan ?? sub.plan?.code ?? "",
    billing_cycle: initialCycle ?? sub.billing_cycle ?? "monthly",
    periods: 1,
    start: ongoing ? "after_current" : "now",
    price_override: "",
    discount: "",
    issue_invoice: true,
    payment_amount: "",
    payment_method: "bank_transfer",
    payment_reference: "",
    payment_date: todayRiyadh(),
    note: "",
  });
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ActivateInput>(key: K, value: ActivateInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (!form.plan_code && plans.length) set("plan_code", plans[0].code);
  }, [plans, form.plan_code]);

  const plan = plans.find((p) => p.code === form.plan_code);
  const vatRate = Number(sub.vat_rate ?? 15);
  const override = form.price_override.trim() ? parseAmount(form.price_override) : null;
  const unit = override ?? (plan ? (form.billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly) : 0);
  const periods = Math.trunc(Number(form.periods));
  // نفس حساب الخادم: الإجمالي = تقريب((قبل الضريبة − الخصم) × (1 + النسبة)) لخانتين، والضريبة = الإجمالي − الصافي
  const subtotalCents = toCents(toCents(unit) * periods / 100);
  const discount = form.discount.trim() ? parseAmount(form.discount) : 0;
  const netCents = subtotalCents - toCents(discount);
  const totalCents = Math.round((netCents * (100 + vatRate)) / 100);
  const subtotal = subtotalCents / 100;
  const vat = (totalCents - netCents) / 100;
  const total = totalCents / 100;
  const base = activationBase(sub);
  const start = form.start === "after_current" && base ? new Date(Math.max(Date.now(), new Date(base).getTime())) : new Date();
  const end = Number.isFinite(periods) && periods > 0 ? addPeriod(start, form.billing_cycle, periods) : null;
  const paymentValue = paid ? parseAmount(form.payment_amount || String(total)) : NaN;

  const problem = !plan
    ? "اختر الباقة"
    : !(periods >= 1 && periods <= 36)
      ? "عدد الفترات من 1 إلى 36"
      : override !== null && !(override >= 0)
        ? "السعر الخاص غير صحيح"
        : !(discount >= 0) || discount > subtotal
          ? "الخصم غير صحيح"
          : paid && !(paymentValue > 0)
            ? "مبلغ الدفعة غير صحيح"
            : "";

  const submit = async () => {
    if (problem) return;
    setBusy(true);
    try {
      const next = await api.activate(companyId, {
        ...form,
        periods,
        price_override: override === null ? "" : String(override),
        discount: discount ? String(discount) : "",
        payment_amount: paid ? String(paymentValue) : "",
        payment_reference: paid ? form.payment_reference.trim() : "",
        payment_date: paid ? form.payment_date : "",
      });
      toast("ok", `فُعّل الاشتراك حتى ${end ? formatDay(end.toISOString()) : ""}`);
      onDone(next);
      onClose();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="تفعيل اشتراك مدفوع" onClose={busy ? () => undefined : onClose} wide>
      <div className="grid-3">
        <SelectField
          label="الباقة"
          value={form.plan_code}
          onChange={(v) => set("plan_code", v)}
          required
          options={plans.map((p) => ({ value: p.code, label: p.name_ar }))}
        />
        <SelectField
          label="الدورة"
          value={form.billing_cycle}
          onChange={(v) => set("billing_cycle", v as Cycle)}
          options={[{ value: "monthly", label: "شهرية" }, { value: "yearly", label: "سنوية" }]}
        />
        <Field label={form.billing_cycle === "yearly" ? "عدد السنوات" : "عدد الأشهر"} value={String(form.periods)} onChange={(v) => set("periods", Number(v))} type="number" ltr inputMode="numeric" />
        <SelectField
          label="تبدأ الفترة"
          value={form.start}
          onChange={(v) => set("start", v as ActivateInput["start"])}
          options={[
            { value: "now", label: "من الآن" },
            ...(activationBase(sub)
              ? [{ value: "after_current", label: sub.status === "trialing" ? "بعد نهاية التجربة" : "بعد نهاية الفترة الحالية" }]
              : []),
          ]}
        />
        <Field
          label="سعر خاص للفترة"
          value={form.price_override}
          onChange={(v) => set("price_override", v)}
          ltr
          inputMode="decimal"
          hint={plan ? `الافتراضي ${money(form.billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly)}` : undefined}
        />
        <Field label="خصم على الفاتورة" value={form.discount} onChange={(v) => set("discount", v)} ltr inputMode="decimal" hint="قبل الضريبة" />
      </div>

      <div className="row" style={{ marginTop: 14, gap: 18 }}>
        <label className="check">
          <input type="checkbox" checked={form.issue_invoice} onChange={(e) => set("issue_invoice", e.target.checked)} />
          إصدار فاتورة اشتراك
        </label>
        <label className="check">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          استُلم المبلغ (تسجيل دفعة)
        </label>
      </div>

      {paid ? (
        <div className="grid-3" style={{ marginTop: 12 }}>
          <Field label="المبلغ المستلم" value={form.payment_amount} onChange={(v) => set("payment_amount", v)} ltr inputMode="decimal" placeholder={money(total)} />
          <SelectField label="طريقة الدفع" value={form.payment_method} onChange={(v) => set("payment_method", v)} options={PAYMENT_METHODS.map((m) => ({ value: m.code, label: m.label }))} />
          <Field label="تاريخ الاستلام" value={form.payment_date} onChange={(v) => set("payment_date", v)} type="date" ltr />
          <Field label="مرجع التحويل" value={form.payment_reference} onChange={(v) => set("payment_reference", v)} ltr className="span-2" maxLength={100} />
        </div>
      ) : null}

      <TextArea label="ملاحظة (في سجل العمليات، وردّ على طلب المنشأة إن وُجد)" value={form.note} onChange={(v) => set("note", v)} rows={2} maxLength={500} />

      <div className="summary-box">
        <div className="line"><span>الفترة</span><b>{formatDay(start.toISOString())} ← {end ? formatDay(end.toISOString()) : "—"}</b></div>
        {form.issue_invoice ? (
          <>
            <div className="line"><span>المبلغ قبل الضريبة</span><span className="num">{money(subtotal)}</span></div>
            {discount > 0 ? <div className="line"><span>الخصم</span><span className="num">-{money(discount)}</span></div> : null}
            <div className="line"><span>الضريبة {vatRate}%</span><span className="num">{money(vat)}</span></div>
            <div className="line total"><span>إجمالي الفاتورة</span><span className="num">{money(total)} {sub.currency ?? "SAR"}</span></div>
          </>
        ) : (
          <div className="line"><span>بلا فاتورة</span><span className="muted">لا يتغير رصيد المنشأة</span></div>
        )}
      </div>

      {problem ? <p className="notice warn" style={{ marginTop: 10 }}>{problem}</p> : null}
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || Boolean(problem)}>
          {busy ? "جاري التفعيل..." : "تفعيل الاشتراك"}
        </button>
      </div>
    </Modal>
  );
}

/* ── تغيير الحالة يدويًا ── */
export type StatusAction = "read_only" | "complimentary" | "cancelled" | "active" | "past_due";
const STATUS_COPY: Record<StatusAction, { title: string; body: string; confirm: string; danger: boolean; reason: boolean }> = {
  read_only: {
    title: "تحويل المنشأة إلى قراءة فقط",
    body: "يتوقف كل إضافة وتعديل وحذف لمستخدمي المنشأة فورًا، وتبقى بياناتهم ظاهرة. يرفعها التمديد أو التفعيل.",
    confirm: "قراءة فقط",
    danger: true,
    reason: true,
  },
  complimentary: {
    title: "اشتراك مجاني دائم",
    body: "تعمل المنشأة بلا انتهاء ولا فواتير حتى تغيّر الحالة. مناسب للشركاء والمنشآت التجريبية الداخلية.",
    confirm: "اجعله مجانيًا",
    danger: false,
    reason: true,
  },
  cancelled: {
    title: "إيقاف التجديد",
    body: "يعمل الاشتراك حتى نهاية الفترة المدفوعة، ثم تصبح المنشأة للقراءة فقط بلا مهلة.",
    confirm: "إيقاف التجديد",
    danger: true,
    reason: false,
  },
  active: {
    title: "إرجاع الاشتراك إلى «مشترك»",
    body: "يعود الاشتراك نشطًا بفترته المدفوعة الحالية (يتطلب فترة سارية أو في المهلة).",
    confirm: "إرجاع",
    danger: false,
    reason: false,
  },
  past_due: {
    title: "تعليم الاشتراك «متأخر السداد»",
    body: "يبقى العمل كاملًا، ويظهر للمنشأة تنبيه بوجود مبلغ مستحق. بعد نهاية الفترة والمهلة تصبح للقراءة فقط.",
    confirm: "تعليم كمتأخر",
    danger: false,
    reason: false,
  },
};

export function StatusDialog({ companyId, action, onClose, onDone }: { companyId: string; action: StatusAction; onClose: () => void; onDone: Done }) {
  const toast = useToast();
  const copy = STATUS_COPY[action];
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (copy.reason && !note.trim()) return;
    setBusy(true);
    try {
      const next = await api.setStatus(companyId, action, note.trim());
      toast("ok", "تم تغيير حالة الاشتراك");
      onDone(next);
      onClose();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={copy.title} onClose={busy ? () => undefined : onClose}>
      <p className="muted" style={{ marginTop: 0 }}>{copy.body}</p>
      <TextArea label={copy.reason ? "السبب (داخلي، في سجل العمليات)" : "ملاحظة (اختيارية)"} value={note} onChange={setNote} rows={2} maxLength={500} required={copy.reason} />
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button type="button" className={`btn ${copy.danger ? "btn-danger-solid" : "btn-primary"}`} onClick={() => void submit()} disabled={busy || (copy.reason && !note.trim())}>
          {busy ? "جاري التنفيذ..." : copy.confirm}
        </button>
      </div>
    </Modal>
  );
}

/* ── فاتورة يدوية ── */
export function InvoiceDialog({ companyId, vatRate, onClose, onDone }: { companyId: string; vatRate: number; onClose: () => void; onDone: Done }) {
  const toast = useToast();
  const [f, setF] = useState({ description: "", subtotal: "", discount: "", vat_rate: String(vatRate), period_start: "", period_end: "", due_at: todayRiyadh() });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof f) => (value: string) => setF((prev) => ({ ...prev, [key]: value }));
  const sub = parseAmount(f.subtotal || "0");
  const disc = parseAmount(f.discount || "0");
  const rate = parseAmount(f.vat_rate || "0");
  const net = sub - disc;
  const vat = Math.round(net * rate) / 100;
  const total = Math.round((net + vat) * 100) / 100;
  const problem = !f.description.trim()
    ? "اكتب وصف الفاتورة"
    : !(sub > 0)
      ? "المبلغ قبل الضريبة أكبر من صفر"
      : !(disc >= 0) || disc > sub
        ? "الخصم غير صحيح"
        : !(rate >= 0 && rate <= 100)
          ? "نسبة الضريبة من 0 إلى 100"
          : "";
  const submit = async () => {
    if (problem) return;
    setBusy(true);
    try {
      const next = await api.issueInvoice(companyId, { ...f, subtotal: String(sub), discount: String(disc || 0), vat_rate: String(rate) });
      toast("ok", "صدرت الفاتورة");
      onDone(next);
      onClose();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="إصدار فاتورة" onClose={busy ? () => undefined : onClose}>
      <div className="grid-2">
        <Field label="الوصف" value={f.description} onChange={set("description")} required className="span-2" maxLength={300} placeholder="مثال: خدمة إعداد وتدريب" />
        <Field label="المبلغ قبل الضريبة" value={f.subtotal} onChange={set("subtotal")} ltr inputMode="decimal" required />
        <Field label="الخصم" value={f.discount} onChange={set("discount")} ltr inputMode="decimal" />
        <Field label="نسبة الضريبة %" value={f.vat_rate} onChange={set("vat_rate")} ltr inputMode="decimal" />
        <Field label="تاريخ الاستحقاق" value={f.due_at} onChange={set("due_at")} type="date" ltr />
        <Field label="بداية الفترة" value={f.period_start} onChange={set("period_start")} type="date" ltr />
        <Field label="نهاية الفترة" value={f.period_end} onChange={set("period_end")} type="date" ltr />
      </div>
      <div className="summary-box">
        <div className="line"><span>الضريبة</span><span className="num">{Number.isFinite(vat) ? money(vat) : "—"}</span></div>
        <div className="line total"><span>الإجمالي</span><span className="num">{Number.isFinite(total) ? money(total) : "—"}</span></div>
      </div>
      {problem && f.subtotal ? <p className="notice warn" style={{ marginTop: 10 }}>{problem}</p> : null}
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || Boolean(problem)}>{busy ? "جاري الإصدار..." : "إصدار الفاتورة"}</button>
      </div>
    </Modal>
  );
}

/* ── دفعة ── */
export function PaymentDialog({ companyId, invoices, onClose, onDone }: { companyId: string; invoices: Invoice[]; onClose: () => void; onDone: Done }) {
  const toast = useToast();
  const open = useMemo(() => invoices.filter((i) => i.status === "issued"), [invoices]);
  const [f, setF] = useState({
    invoice_id: open[0]?.id ?? "",
    amount: open[0] ? String(Math.max(0, Number(open[0].total) - Number(open[0].paid_amount ?? 0))) : "",
    method: "bank_transfer",
    reference: "",
    received_at: todayRiyadh(),
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof f) => (value: string) => setF((prev) => ({ ...prev, [key]: value }));
  const amount = parseAmount(f.amount);
  const submit = async () => {
    if (!(amount > 0)) return;
    setBusy(true);
    try {
      const next = await api.recordPayment(companyId, { ...f, amount: String(amount) });
      toast("ok", "سُجّلت الدفعة");
      onDone(next);
      onClose();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="تسجيل دفعة" onClose={busy ? () => undefined : onClose}>
      <div className="grid-2">
        <SelectField
          label="على الفاتورة"
          value={f.invoice_id}
          onChange={(v) => {
            const inv = open.find((i) => i.id === v);
            setF((prev) => ({ ...prev, invoice_id: v, amount: inv ? String(Math.max(0, Number(inv.total) - Number(inv.paid_amount ?? 0))) : prev.amount }));
          }}
          className="span-2"
          options={[{ value: "", label: "بلا فاتورة (رصيد للمنشأة)" }, ...open.map((i) => ({ value: i.id, label: `${i.number} — ${money(i.total)} (المتبقي ${money(Number(i.total) - Number(i.paid_amount ?? 0))})` }))]}
        />
        <Field label="المبلغ" value={f.amount} onChange={set("amount")} ltr inputMode="decimal" required />
        <SelectField label="الطريقة" value={f.method} onChange={set("method")} options={PAYMENT_METHODS.map((m) => ({ value: m.code, label: m.label }))} />
        <Field label="تاريخ الاستلام" value={f.received_at} onChange={set("received_at")} type="date" ltr />
        <Field label="المرجع" value={f.reference} onChange={set("reference")} ltr maxLength={100} />
        <TextArea label="ملاحظات" value={f.notes} onChange={set("notes")} rows={2} maxLength={500} className="span-2" />
      </div>
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !(amount > 0)}>{busy ? "جاري التسجيل..." : "تسجيل الدفعة"}</button>
      </div>
    </Modal>
  );
}

/* ── تسوية رصيد ── */
export function AdjustmentDialog({ companyId, onClose, onDone }: { companyId: string; onClose: () => void; onDone: Done }) {
  const toast = useToast();
  const [kind, setKind] = useState<"credit" | "charge">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const value = parseAmount(amount);
  const submit = async () => {
    if (!(value > 0) || !reason.trim()) return;
    setBusy(true);
    try {
      const next = await api.addAdjustment(companyId, kind === "credit" ? -value : value, reason.trim());
      toast("ok", "سُجّلت التسوية");
      onDone(next);
      onClose();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="تسوية رصيد المنشأة" onClose={busy ? () => undefined : onClose}>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button type="button" className={`chip ${kind === "credit" ? "active" : ""}`} onClick={() => setKind("credit")}>رصيد للمنشأة (خصم أو تعويض)</button>
        <button type="button" className={`chip ${kind === "charge" ? "active" : ""}`} onClick={() => setKind("charge")}>مبلغ عليها (رسوم)</button>
      </div>
      <div className="grid-2">
        <Field label="المبلغ" value={amount} onChange={setAmount} ltr inputMode="decimal" required />
        <TextArea label="السبب (يظهر للمنشأة في صفحة الاشتراك)" value={reason} onChange={setReason} rows={2} maxLength={500} required className="span-2" />
      </div>
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !(value > 0) || !reason.trim()}>{busy ? "جاري الحفظ..." : "حفظ التسوية"}</button>
      </div>
    </Modal>
  );
}
