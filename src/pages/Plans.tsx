import { useCallback, useEffect, useState } from "react";
import { api, errorText, MODULES, money, type Plan } from "../api";
import { useShell } from "../shell";
import { invalidatePlans } from "../components/SubscriptionDialogs";
import { Field, Modal, TextArea, useToast } from "../components/Ui";

type Draft = {
  isNew: boolean;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  price_monthly: string;
  price_yearly: string;
  max_users: string;
  max_employees: string;
  max_branches: string;
  modules: string[];
  features: string;
  is_public: boolean;
  is_active: boolean;
  sort_order: string;
};

const toDraft = (p: Plan | null): Draft =>
  p
    ? {
        isNew: false,
        code: p.code,
        name_ar: p.name_ar,
        name_en: p.name_en,
        description_ar: p.description_ar,
        price_monthly: String(p.price_monthly),
        price_yearly: String(p.price_yearly),
        max_users: p.max_users === null ? "" : String(p.max_users),
        max_employees: p.max_employees === null ? "" : String(p.max_employees),
        max_branches: p.max_branches === null ? "" : String(p.max_branches),
        modules: [...(p.modules ?? [])],
        features: (p.features ?? []).join("\n"),
        is_public: p.is_public,
        is_active: p.is_active,
        sort_order: String(p.sort_order),
      }
    : {
        isNew: true, code: "", name_ar: "", name_en: "", description_ar: "", price_monthly: "", price_yearly: "", max_users: "",
        max_employees: "", max_branches: "", modules: MODULES.map((m) => m.code), features: "", is_public: true, is_active: true, sort_order: "10",
      };

type Forms = { none: string; one: string; two: string; few: string; many: string };
const limitText = (n: number | null, f: Forms) =>
  n === null ? f.none : n === 1 ? f.one : n === 2 ? f.two : n <= 10 ? `${n} ${f.few}` : `${n} ${f.many}`;
const USERS: Forms = { none: "مستخدمون بلا حد", one: "مستخدم واحد", two: "مستخدمان", few: "مستخدمين", many: "مستخدمًا" };
const EMPLOYEES: Forms = { none: "موظفون بلا حد", one: "موظف واحد", two: "موظفان", few: "موظفين", many: "موظفًا" };
const BRANCHES: Forms = { none: "فروع بلا حد", one: "فرع واحد", two: "فرعان", few: "فروع", many: "فرعًا" };

/** الباقات والأسعار: تُعدَّل من هنا وتظهر للمنشآت في صفحة «الاشتراك» (العامة والفعّالة فقط) */
export default function Plans() {
  const toast = useToast();
  const { tick } = useShell();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlans(await api.listPlans());
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load, tick]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    if (!draft) return;
    const features = draft.features.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!draft.name_ar.trim()) return toast("error", "اسم الباقة بالعربية مطلوب");
    if (draft.isNew && !/^[a-z0-9_-]{2,30}$/.test(draft.code.trim())) return toast("error", "رمز الباقة: حروف إنجليزية صغيرة وأرقام و - أو _");
    for (const [label, v] of [["السعر الشهري", draft.price_monthly], ["السعر السنوي", draft.price_yearly]] as const) {
      if (v.trim() && !(Number(v) >= 0)) return toast("error", `${label} غير صحيح`);
    }
    for (const [label, v] of [["حد المستخدمين", draft.max_users], ["حد الموظفين", draft.max_employees], ["حد الفروع", draft.max_branches]] as const) {
      if (v.trim() && !(Number.isInteger(Number(v)) && Number(v) >= 1)) return toast("error", `${label}: رقم صحيح موجب، أو فارغ = بلا حد`);
    }
    setBusy(true);
    try {
      const rows = await api.savePlan({
        is_new: draft.isNew,
        code: draft.code.trim(),
        name_ar: draft.name_ar.trim(),
        name_en: draft.name_en.trim(),
        description_ar: draft.description_ar.trim(),
        price_monthly: draft.price_monthly.trim() || "0",
        price_yearly: draft.price_yearly.trim() || "0",
        max_users: draft.max_users.trim(),
        max_employees: draft.max_employees.trim(),
        max_branches: draft.max_branches.trim(),
        modules: draft.modules,
        features,
        is_public: draft.is_public,
        is_active: draft.is_active,
        sort_order: draft.sort_order.trim() || "0",
      });
      setPlans(rows);
      invalidatePlans();
      toast("ok", "حُفظت الباقة");
      setDraft(null);
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="notice info">
        الأسعار قبل ضريبة القيمة المضافة. تغيير السعر لا يغيّر فواتير صدرت، ويُطبَّق على التفعيلات القادمة.
        الحدود (المستخدمون والموظفون الفعّالون والفروع) يفرضها الخادم فورًا. الأقسام المحددة تظهر للمنشأة وصفًا للباقة، وحجب الأقسام غير المشمولة يأتي في تحديث لاحق.
      </div>
      <div className="row">
        <span className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setDraft(toDraft(null))}>باقة جديدة</button>
      </div>
      <div className="plans">
        {plans.map((p) => (
          <article key={p.id} className={`card plan ${p.is_active ? "" : "off"}`}>
            <div className="row">
              <h3>{p.name_ar}</h3>
              <span className="spacer" />
              {!p.is_active ? <span className="pill pill-muted">معطّلة</span> : !p.is_public ? <span className="pill pill-warn">مخفية</span> : <span className="pill pill-ok">ظاهرة</span>}
            </div>
            <div className="muted small mono">{p.code}</div>
            <div className="price">{money(p.price_monthly)} <small>شهريًا</small></div>
            <div className="muted small">{money(p.price_yearly)} سنويًا</div>
            <div className="limits">
              <span className="tag">{limitText(p.max_users, USERS)}</span>
              <span className="tag">{limitText(p.max_employees, EMPLOYEES)}</span>
              <span className="tag">{limitText(p.max_branches, BRANCHES)}</span>
            </div>
            {(p.features ?? []).length ? <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul> : null}
            <div className="row" style={{ marginTop: "auto" }}>
              <span className="muted small">{p.subscribers === 0 ? "لا منشآت عليها" : limitText(p.subscribers, { none: "", one: "منشأة واحدة", two: "منشأتان", few: "منشآت", many: "منشأة" })}</span>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={() => setDraft(toDraft(p))}>تعديل</button>
            </div>
          </article>
        ))}
      </div>

      {draft ? (
        <Modal title={draft.isNew ? "باقة جديدة" : `تعديل باقة ${draft.name_ar}`} onClose={busy ? () => undefined : () => setDraft(null)} wide>
          <div className="grid-3">
            <Field label="الرمز" value={draft.code} onChange={(v) => set("code", v.toLowerCase())} ltr required disabled={!draft.isNew} hint={draft.isNew ? "لا يتغير بعد الحفظ" : undefined} />
            <Field label="الاسم بالعربية" value={draft.name_ar} onChange={(v) => set("name_ar", v)} required maxLength={100} />
            <Field label="الاسم بالإنجليزية" value={draft.name_en} onChange={(v) => set("name_en", v)} ltr maxLength={100} />
            <TextArea label="الوصف" value={draft.description_ar} onChange={(v) => set("description_ar", v)} rows={2} maxLength={500} className="span-2" />
            <Field label="الترتيب" value={draft.sort_order} onChange={(v) => set("sort_order", v)} type="number" ltr />
            <Field label="السعر الشهري" value={draft.price_monthly} onChange={(v) => set("price_monthly", v)} ltr inputMode="decimal" hint="ر.س قبل الضريبة" />
            <Field label="السعر السنوي" value={draft.price_yearly} onChange={(v) => set("price_yearly", v)} ltr inputMode="decimal" hint="ر.س قبل الضريبة" />
            <div />
            <Field label="حد المستخدمين" value={draft.max_users} onChange={(v) => set("max_users", v)} ltr inputMode="numeric" hint="فارغ = بلا حد" />
            <Field label="حد الموظفين الفعّالين" value={draft.max_employees} onChange={(v) => set("max_employees", v)} ltr inputMode="numeric" hint="فارغ = بلا حد" />
            <Field label="حد الفروع" value={draft.max_branches} onChange={(v) => set("max_branches", v)} ltr inputMode="numeric" hint="فارغ = بلا حد" />
          </div>
          <h3 className="section-title">الأقسام المشمولة</h3>
          <div className="row" style={{ gap: "8px 18px" }}>
            {MODULES.map((m) => (
              <label key={m.code} className="check">
                <input
                  type="checkbox"
                  checked={draft.modules.includes(m.code)}
                  onChange={(e) => set("modules", e.target.checked ? [...draft.modules, m.code] : draft.modules.filter((c) => c !== m.code))}
                />
                {m.label}
              </label>
            ))}
          </div>
          <TextArea label="المزايا (سطر لكل ميزة، تظهر للمنشأة)" value={draft.features} onChange={(v) => set("features", v)} rows={5} />
          <div className="row" style={{ marginTop: 12, gap: 18 }}>
            <label className="check"><input type="checkbox" checked={draft.is_public} onChange={(e) => set("is_public", e.target.checked)} /> ظاهرة للمنشآت</label>
            <label className="check"><input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} /> فعّالة (يمكن التفعيل عليها)</label>
          </div>
          <div className="row-end">
            <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>إلغاء</button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>{busy ? "جاري الحفظ..." : "حفظ الباقة"}</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
