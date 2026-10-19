import { SAUDI_REGIONS, type EditableCompany } from "../api";
import { Field, SelectField } from "./Ui";

export const emptyCompany = (): EditableCompany => ({
  name_ar: "",
  name_en: "",
  vat_number: "",
  cr_number: "",
  phone: "",
  email: "",
  city: "",
  region: "",
  address_ar: "",
  address_en: "",
  bank_name: "",
  iban: "",
  contact_name: "",
  employee_email_domain: "",
});

/** التحقق قبل الإرسال (نفس قيود قاعدة البيانات company_identity_check حسب الدولة) */
export function validateCompany(values: EditableCompany, country: string): string {
  const saudi = (country || "SA").toUpperCase() === "SA";
  const vat = values.vat_number.trim();
  const cr = values.cr_number.trim();
  if (!values.name_ar.trim()) return "اسم المنشأة بالعربية مطلوب";
  if (saudi) {
    if (vat && !/^3\d{13}3$/.test(vat)) return "الرقم الضريبي 15 رقمًا يبدأ وينتهي بالرقم 3";
    if (cr && !/^\d{10}$/.test(cr)) return "السجل التجاري 10 أرقام";
  } else {
    if (vat && !(/^[A-Za-z0-9-]{3,20}$/.test(vat) && /[A-Za-z0-9]/.test(vat))) return "الرقم الضريبي: من 3 إلى 20 حرفًا أو رقمًا (ويُقبل -)";
    if (cr && !(/^[A-Za-z0-9/-]{1,30}$/.test(cr) && /[A-Za-z0-9]/.test(cr))) return "السجل: حتى 30 حرفًا أو رقمًا (ويُقبل / و -)";
  }
  if (values.region.trim().length > 100) return "المنطقة 100 حرف على الأكثر";
  const iban = values.iban.replace(/\s+/g, "").toUpperCase();
  if (iban && !/^SA\d{22}$/.test(iban)) return "الآيبان السعودي يبدأ بـ SA ويتبعه 22 رقمًا";
  const domain = values.employee_email_domain.trim().toLowerCase();
  if (domain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) return "نطاق البريد الداخلي غير صحيح (مثل company.com)";
  return "";
}

export function CompanyFields({
  values,
  onChange,
  country,
  disabled = false,
}: {
  values: EditableCompany;
  onChange: (values: EditableCompany) => void;
  country: string;
  disabled?: boolean;
}) {
  const set = (key: keyof EditableCompany) => (value: string) => onChange({ ...values, [key]: value });
  const saudi = (country || "SA").toUpperCase() === "SA";
  const regionOptions = SAUDI_REGIONS.includes(values.region) || !values.region ? SAUDI_REGIONS : [values.region, ...SAUDI_REGIONS];
  return (
    <>
      <h3 className="section-title">بيانات المنشأة (تظهر على الفواتير)</h3>
      <div className="grid-2">
        <Field label="اسم المنشأة بالعربية" value={values.name_ar} onChange={set("name_ar")} required disabled={disabled} />
        <Field label="اسم المنشأة بالإنجليزية" value={values.name_en} onChange={set("name_en")} ltr disabled={disabled} />
        <Field label="الرقم الضريبي" value={values.vat_number} onChange={set("vat_number")} ltr placeholder={saudi ? "3XXXXXXXXXXXXX3" : ""} disabled={disabled} />
        <Field label={saudi ? "السجل التجاري" : "السجل / الرخصة التجارية"} value={values.cr_number} onChange={set("cr_number")} ltr placeholder={saudi ? "10 أرقام" : ""} disabled={disabled} />
      </div>
      <h3 className="section-title">العنوان والتواصل</h3>
      <div className="grid-2">
        {saudi ? (
          <SelectField
            label="المنطقة"
            value={values.region}
            onChange={set("region")}
            disabled={disabled}
            options={[{ value: "", label: "— اختر المنطقة —" }, ...regionOptions.map((r) => ({ value: r, label: r }))]}
          />
        ) : (
          <Field label="المنطقة / الولاية" value={values.region} onChange={set("region")} disabled={disabled} maxLength={100} />
        )}
        <Field label="المدينة" value={values.city} onChange={set("city")} disabled={disabled} />
        <Field label="العنوان الوطني بالعربية" value={values.address_ar} onChange={set("address_ar")} disabled={disabled} />
        <Field label="العنوان بالإنجليزية" value={values.address_en} onChange={set("address_en")} ltr disabled={disabled} />
        <Field label="اسم المسؤول" value={values.contact_name} onChange={set("contact_name")} disabled={disabled} />
        <Field label="الجوال" value={values.phone} onChange={set("phone")} ltr disabled={disabled} />
        <Field label="بريد المنشأة" value={values.email} onChange={set("email")} ltr disabled={disabled} />
      </div>
      <h3 className="section-title">البنك والبريد الداخلي</h3>
      <div className="grid-2">
        <Field label="البنك" value={values.bank_name} onChange={set("bank_name")} disabled={disabled} />
        <Field label="الآيبان" value={values.iban} onChange={set("iban")} ltr placeholder="SA0000000000000000000000" disabled={disabled} />
        <Field
          label="نطاق البريد الداخلي للموظفين"
          value={values.employee_email_domain}
          onChange={set("employee_email_domain")}
          ltr
          placeholder="company.com"
          disabled={disabled}
        />
      </div>
    </>
  );
}
