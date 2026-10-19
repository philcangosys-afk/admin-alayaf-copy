import { useState } from "react";
import { api, COUNTRIES, errorText, type EditableCompany } from "../api";
import { useShell } from "../shell";
import { CompanyFields, emptyCompany, validateCompany } from "./CompanyForm";
import { Field, SelectField, useToast } from "./Ui";

/**
 * إنشاء منشأة من المنصة مباشرة (فعالة فورًا، وتبدأ فترتها التجريبية):
 * يُنشأ لها «مدير النظام» ببريد صاحبها، ويسجّل صاحبها حسابه من صفحة «سجّل منشأتك» بنفس البريد
 * ثم يدخل، فيُربط بالمنشأة تلقائيًا عند أول دخول.
 */
export default function CreateCompany() {
  const toast = useToast();
  const { go, reloadStats } = useShell();
  const [ownerEmail, setOwnerEmail] = useState("");
  const [country, setCountry] = useState("SA");
  const [values, setValues] = useState<EditableCompany>(emptyCompany());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ id: string; code: number; owner_emp_id: string | null; owner: string } | null>(null);

  const submit = async () => {
    const owner = ownerEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner)) {
      toast("error", "بريد صاحب المنشأة غير صحيح");
      return;
    }
    const problem = validateCompany(values, country);
    if (problem) {
      toast("error", problem);
      return;
    }
    setSaving(true);
    try {
      const created = await api.createCompany({
        ...values,
        country,
        owner_email: owner,
        iban: values.iban.replace(/\s+/g, "").toUpperCase(),
        employee_email_domain: values.employee_email_domain.trim().toLowerCase(),
      });
      setResult({ id: created.id, code: created.code, owner_emp_id: created.owner_emp_id, owner });
      setValues(emptyCompany());
      setOwnerEmail("");
      toast("ok", `أُنشئت المنشأة ${created.code}`);
      void reloadStats();
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card card-pad">
      <h2 className="card-title">منشأة جديدة (تُفعَّل مباشرة وتبدأ تجربتها)</h2>
      {result ? (
        <div className="notice ok" style={{ marginBottom: 14 }}>
          أُنشئت المنشأة رقم <b className="mono">{result.code}</b> (بادئة المستندات <b dir="ltr" className="mono">{result.code}-</b>).
          {result.owner_emp_id ? <> مدير النظام: <b dir="ltr" className="mono">{result.owner_emp_id}</b>.</> : null}
          <br />
          الخطوة التالية لصاحب المنشأة: يفتح صفحة «سجّل منشأتك» في النظام وينشئ حسابه بالبريد <b dir="ltr">{result.owner}</b>،
          ثم يؤكد بريده ويدخل؛ يُربط بالمنشأة تلقائيًا.{" "}
          <button type="button" className="link" onClick={() => go(`company/${result.id}`)}>فتح صفحة المنشأة</button>
        </div>
      ) : null}
      <div className="grid-2">
        <Field label="بريد صاحب المنشأة" value={ownerEmail} onChange={setOwnerEmail} ltr required disabled={saving} placeholder="owner@company.com" />
        <SelectField
          label="الدولة"
          value={country}
          onChange={(v) => {
            setCountry(v);
            setValues((prev) => ({ ...prev, region: "" }));
          }}
          disabled={saving}
          hint="لا تتغير بعد الإنشاء"
          options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
        />
      </div>
      <CompanyFields values={values} onChange={setValues} country={country} disabled={saving} />
      <div className="row-end">
        <button type="button" className="btn" onClick={() => go("companies")} disabled={saving}>رجوع</button>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
          {saving ? "جاري الإنشاء..." : "إنشاء المنشأة"}
        </button>
      </div>
    </section>
  );
}
