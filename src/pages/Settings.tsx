import { useCallback, useEffect, useState } from "react";
import { api, errorText, type Plan, type PlatformSettings } from "../api";
import { useShell } from "../shell";
import { Field, SelectField, TextArea, useToast } from "../components/Ui";

type Form = {
  trial_days: string;
  grace_days: string;
  default_plan_code: string;
  vat_rate: string;
  currency: string;
  issuer_name: string;
  issuer_vat: string;
  issuer_cr: string;
  issuer_address: string;
  issuer_bank: string;
  issuer_iban: string;
  support_email: string;
  support_phone: string;
  support_whatsapp: string;
  payment_instructions: string;
};

const toForm = (s: PlatformSettings): Form => ({
  trial_days: String(s.trial_days ?? 7),
  grace_days: String(s.grace_days ?? 7),
  default_plan_code: String(s.default_plan_code ?? ""),
  vat_rate: String(s.vat_rate ?? 15),
  currency: String(s.currency ?? "SAR"),
  issuer_name: s.invoice_issuer?.name_ar ?? "",
  issuer_vat: s.invoice_issuer?.vat_number ?? "",
  issuer_cr: s.invoice_issuer?.cr_number ?? "",
  issuer_address: s.invoice_issuer?.address_ar ?? "",
  issuer_bank: s.invoice_issuer?.bank_name ?? "",
  issuer_iban: s.invoice_issuer?.iban ?? "",
  support_email: s.support?.email ?? "",
  support_phone: s.support?.phone ?? "",
  support_whatsapp: s.support?.whatsapp ?? "",
  payment_instructions: s.payment_instructions ?? "",
});

/** إعدادات المنصة: التجربة والمهلة والضريبة، وبيانات فواتير المنصة، والتواصل وتعليمات الدفع */
export default function Settings() {
  const toast = useToast();
  const { tick } = useShell();
  const [form, setForm] = useState<Form | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.getSettings(), api.listPlans()]);
      setForm(toForm(s));
      setPlans(p.filter((x) => x.is_active));
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load, tick]);

  if (!form) return <div className="card card-pad muted">جاري التحميل...</div>;
  const set = (key: keyof Form) => (value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = async () => {
    const trial = Number(form.trial_days);
    const grace = Number(form.grace_days);
    const vat = Number(form.vat_rate);
    if (!(Number.isInteger(trial) && trial >= 1 && trial <= 90)) return toast("error", "أيام التجربة رقم صحيح من 1 إلى 90");
    if (!(Number.isInteger(grace) && grace >= 0 && grace <= 30)) return toast("error", "مهلة السماح رقم صحيح من 0 إلى 30");
    if (!(vat >= 0 && vat <= 100)) return toast("error", "نسبة الضريبة من 0 إلى 100");
    const iban = form.issuer_iban.replace(/\s+/g, "").toUpperCase();
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return toast("error", "الآيبان غير صحيح");
    setBusy(true);
    try {
      const saved = await api.saveSettings({
        trial_days: trial,
        grace_days: grace,
        vat_rate: vat,
        default_plan_code: form.default_plan_code,
        currency: form.currency.trim().toUpperCase(),
        invoice_issuer: {
          name_ar: form.issuer_name.trim(), vat_number: form.issuer_vat.trim(), cr_number: form.issuer_cr.trim(),
          address_ar: form.issuer_address.trim(), bank_name: form.issuer_bank.trim(), iban,
        },
        support: { email: form.support_email.trim(), phone: form.support_phone.trim(), whatsapp: form.support_whatsapp.trim() },
        payment_instructions: form.payment_instructions.trim(),
      });
      setForm(toForm(saved));
      toast("ok", "حُفظت الإعدادات");
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card card-pad">
        <h2 className="card-title">الفترة التجريبية والاشتراك</h2>
        <div className="grid-3">
          <Field label="أيام التجربة المجانية" value={form.trial_days} onChange={set("trial_days")} type="number" ltr hint="للمنشآت الجديدة؛ القائمة تُمدَّد من صفحتها" />
          <Field label="مهلة السماح بعد انتهاء الاشتراك المدفوع" value={form.grace_days} onChange={set("grace_days")} type="number" ltr hint="أيام قبل القراءة فقط" />
          <SelectField
            label="باقة التجربة"
            value={form.default_plan_code}
            onChange={set("default_plan_code")}
            options={plans.map((p) => ({ value: p.code, label: p.name_ar }))}
          />
          <Field label="نسبة ضريبة القيمة المضافة %" value={form.vat_rate} onChange={set("vat_rate")} ltr inputMode="decimal" />
          <Field label="العملة" value={form.currency} onChange={set("currency")} ltr maxLength={3} />
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          بعد انتهاء التجربة تصبح المنشأة للقراءة فقط مباشرة (بلا مهلة) حتى التفعيل. المهلة للاشتراك المدفوع فقط.
        </p>
      </section>

      <section className="card card-pad">
        <h2 className="card-title">بيانات المنصة على فواتير الاشتراك</h2>
        <div className="grid-3">
          <Field label="الاسم" value={form.issuer_name} onChange={set("issuer_name")} />
          <Field label="الرقم الضريبي" value={form.issuer_vat} onChange={set("issuer_vat")} ltr />
          <Field label="السجل التجاري" value={form.issuer_cr} onChange={set("issuer_cr")} ltr />
          <Field label="العنوان" value={form.issuer_address} onChange={set("issuer_address")} className="span-2" />
          <div />
          <Field label="البنك" value={form.issuer_bank} onChange={set("issuer_bank")} />
          <Field label="الآيبان" value={form.issuer_iban} onChange={set("issuer_iban")} ltr className="span-2" />
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>
          تُحفظ هذه البيانات داخل كل فاتورة وقت إصدارها. فواتير الاشتراك الآن مستندات داخلية للمنصة؛ ربطها بالفوترة الإلكترونية للهيئة خطوة لاحقة.
        </p>
      </section>

      <section className="card card-pad">
        <h2 className="card-title">التواصل وتعليمات الدفع (تظهر للمنشآت)</h2>
        <div className="grid-3">
          <Field label="بريد الدعم" value={form.support_email} onChange={set("support_email")} ltr />
          <Field label="هاتف الدعم" value={form.support_phone} onChange={set("support_phone")} ltr />
          <Field label="واتساب" value={form.support_whatsapp} onChange={set("support_whatsapp")} ltr placeholder="9665XXXXXXXX" />
          <TextArea label="تعليمات الدفع" value={form.payment_instructions} onChange={set("payment_instructions")} rows={4} maxLength={2000} className="span-2" />
        </div>
      </section>

      <div className="row-end" style={{ marginTop: 0 }}>
        <button type="button" className="btn" onClick={() => void load()} disabled={busy}>تراجع</button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? "جاري الحفظ..." : "حفظ الإعدادات"}</button>
      </div>
    </>
  );
}
