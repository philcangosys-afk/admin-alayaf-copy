import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * إعدادات اللوحة. الرابط والمفتاح العام فقط يصلان إلى كود المتصفح.
 * - على هذا الجهاز (npm run dev على 127.0.0.1): دخول تلقائي. بريد مدير المنصة وكلمة مروره في .env.local
 *   يقرؤهما خادم التطوير المحلي (vite.config.ts) ويعطي المتصفح رموز الجلسة فقط.
 * - على الاستضافة (Netlify): لا خادم محلي، فيدخل المدير ببريده وكلمة مروره من شاشة الدخول. لا كلمة مرور في كود اللوحة.
 * في الحالتين الصلاحية تحسمها دوال platform_* في قاعدة البيانات (ترفض أي حساب ليس في platform_admins).
 */
export const config = {
  url: String(import.meta.env.VITE_SUPABASE_URL ?? "").trim(),
  anonKey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim(),
};

/**
 * اللوحة مفتوحة من خادم التطوير على هذا الجهاز (دخول تلقائي)، أو نسخة مبنية (شاشة دخول).
 * النسخة المبنية (npm run build) تطلب الدخول دائمًا، حتى لو فُتحت على هذا الجهاز.
 */
export const isLocalPanel = import.meta.env.DEV && ["127.0.0.1", "localhost"].includes(window.location.hostname);

const STORAGE_KEY = "platform-admin-session";
/**
 * على هذا الجهاز: الجلسة تبقى بعد إغلاق المتصفح (localStorage).
 * المنشورة: محفوظة في التبويب فقط (sessionStorage)، فلا يأخذها تبويب جديد.
 * المتصفح قد يعيدها عند استرجاع تبويب مغلق، فالذي ينهيها فعلًا هو «تسجيل الخروج».
 */
const sessionStore = (): Storage => (isLocalPanel ? window.localStorage : window.sessionStorage);

/** مسح جلسة اللوحة من هذا المتصفح مباشرة (حين لا يكملها Supabase بنفسه) */
export function purgeStoredSession() {
  for (const key of [STORAGE_KEY, `${STORAGE_KEY}-user`, `${STORAGE_KEY}-code-verifier`]) {
    try {
      sessionStore().removeItem(key);
    } catch {
      // التخزين غير متاح: لا جلسة محفوظة أصلًا
    }
  }
}

export const configMissing = (): string[] =>
  [
    !config.url && "VITE_SUPABASE_URL",
    !config.anonKey && "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean) as string[];

export const configMissingText = (missing: string[]) =>
  isLocalPanel
    ? `أكمل ملف .env.local: ${missing.join("، ")}`
    : `أضف في Netlify (Site configuration ← Environment variables): ${missing.join("، ")}، ثم أعد النشر`;

type LocalReply = { error?: string; message?: string; missing?: string[]; email?: string; access_token?: string; refresh_token?: string };

async function localCall(path: string, method: "GET" | "POST"): Promise<LocalReply & { ok: boolean }> {
  try {
    const response = await fetch(path, { method, headers: { "X-Platform-Panel": "1" }, cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as LocalReply;
    return { ...body, ok: response.ok };
  } catch {
    return { ok: false, error: "LOCAL_SERVER_UNREACHABLE" };
  }
}

const localErrorText = (reply: LocalReply) => {
  if (reply.error === "CONFIG_MISSING" || (reply.missing ?? []).length) return `أكمل ملف .env.local: ${(reply.missing ?? []).join("، ")}`;
  if (reply.error === "SIGN_IN_FAILED") return `تعذر دخول حساب مدير المنصة: ${reply.message ?? ""}`;
  if (reply.error === "SIGN_IN_UNREACHABLE") return "تعذر الاتصال بـ Supabase؛ تحقق من الإنترنت ومن VITE_SUPABASE_URL";
  if (reply.error === "FORBIDDEN") return "افتح اللوحة من http://127.0.0.1:5180 مباشرة";
  return "شغّل اللوحة بالأمر npm run dev (خادم اللوحة المحلي غير متاح)";
};

type BootResult = { ok: true; email: string } | { ok: false; message: string; login?: boolean };

/**
 * بداية الجلسة.
 * - على هذا الجهاز: الجلسة المحفوظة إن كانت لنفس البريد المضبوط، وإلا جلسة جديدة من الخادم المحلي.
 * - على الاستضافة: الجلسة المحفوظة في هذا المتصفح إن وُجدت، وإلا شاشة الدخول (login: true).
 * مشتركة بين الاستدعاءات (StrictMode يشغّل التأثير مرتين) فلا يتكرر الدخول.
 */
let bootPromise: Promise<BootResult> | null = null;
export function bootSession() {
  if (!bootPromise) {
    bootPromise = (async (): Promise<BootResult> => {
      if (!isLocalPanel) {
        // نسخة سابقة كانت تحفظ في localStorage: لا يبقى منها شيء في هذا المتصفح
        try {
          window.localStorage.removeItem(STORAGE_KEY);
          window.localStorage.removeItem(`${STORAGE_KEY}-user`);
        } catch {
          // التخزين غير متاح
        }
        const { data, error } = await supabase().auth.getSession();
        // جلسة مرفوضة (رمز تجديد غير صالح): Supabase مسحها، فشاشة الدخول
        if (error && isSessionError(error)) return { ok: false, message: "انتهت الجلسة. ادخل مرة أخرى.", login: true };
        // تعذر التجديد (اتصال): شاشة خطأ فيها «إعادة المحاولة» و«تسجيل الخروج»، لا شاشة دخول والجلسة باقية
        if (error) return { ok: false, message: `تعذر التحقق من الجلسة: ${error.message || "خطأ في الاتصال"}` };
        if (!data.session) return { ok: false, message: "", login: true };
        return { ok: true, email: String(data.session.user.email ?? "").toLowerCase() };
      }
      const configured = await localCall("/__platform/config", "GET");
      if (!configured.ok) return { ok: false as const, message: localErrorText(configured) };
      if ((configured.missing ?? []).length) return { ok: false as const, message: localErrorText(configured) };
      const adminEmail = String(configured.email ?? "").toLowerCase();
      const client = supabase();
      const { data } = await client.auth.getSession();
      const currentEmail = data.session?.user.email?.toLowerCase() ?? "";
      if (data.session && currentEmail === adminEmail) return { ok: true as const, email: adminEmail };
      if (data.session) await client.auth.signOut({ scope: "local" });
      const reply = await localCall("/__platform/session", "POST");
      if (!reply.ok || !reply.access_token || !reply.refresh_token) return { ok: false as const, message: localErrorText(reply) };
      const { error } = await client.auth.setSession({ access_token: reply.access_token, refresh_token: reply.refresh_token });
      if (error) return { ok: false as const, message: `تعذر فتح جلسة مدير المنصة: ${error.message}` };
      return { ok: true as const, email: String(reply.email ?? adminEmail) };
    })().catch(() => ({ ok: false as const, message: "تعذر الدخول إلى لوحة المنصة" }));
    // محاولة فاشلة لا تُحفظ: إعادة تحميل الصفحة تعيد المحاولة
    void bootPromise.then((result) => { if (!result.ok) bootPromise = null; });
  }
  return bootPromise;
}

const signInErrorText = (error: { message?: string; status?: number; code?: string } | null) => {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) return "البريد أو كلمة المرور غير صحيحة";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) return "هذا البريد غير مؤكد في Supabase (Authentication ← Users)";
  if (error?.status === 429 || /rate limit|too many/i.test(message)) return "محاولات دخول كثيرة. انتظر بضع دقائق ثم أعد المحاولة";
  if (/fetch|network/i.test(message)) return "تعذر الاتصال بـ Supabase؛ تحقق من الإنترنت";
  return `تعذر الدخول: ${message || "خطأ غير معروف"}`;
};

/** الدخول من شاشة الدخول (الاستضافة). كلمة المرور تذهب إلى Supabase مباشرة ولا تُحفظ في اللوحة */
export async function signInPanel(email: string, password: string): Promise<{ ok: true; email: string } | { ok: false; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) return { ok: false, message: "اكتب البريد الإلكتروني وكلمة المرور" };
  try {
    const { data, error } = await supabase().auth.signInWithPassword({ email: cleanEmail, password });
    if (error || !data.session) return { ok: false, message: signInErrorText(error) };
    bootPromise = null;
    return { ok: true, email: String(data.user?.email ?? cleanEmail).toLowerCase() };
  } catch {
    return { ok: false, message: "تعذر الاتصال بـ Supabase؛ تحقق من الإنترنت" };
  }
}

/**
 * تسجيل الخروج من هذا المتصفح فقط (لا يُنهي جلسات مدير المنصة على أجهزة أخرى).
 * إن تعذر على Supabase إنهاؤها (اتصال أو خطأ خادم) تُمسح من هذا المتصفح مباشرة، فلا تعود عند فتح الرابط.
 */
export async function signOutPanel() {
  bootPromise = null;
  let failed = false;
  try {
    const { error } = await supabase().auth.signOut({ scope: "local" });
    failed = Boolean(error);
  } catch {
    failed = true;
  }
  if (failed) {
    purgeStoredSession();
    try {
      // بلا جلسة محفوظة: يمسح ما في الذاكرة ويبلّغ التبويبات الأخرى
      await supabase().auth.signOut({ scope: "local" });
    } catch {
      // المسح تم أعلاه
    }
  }
}

/** خطأ سببه الجلسة نفسها (منتهية أو مرفوضة أو غير موجودة)، لا الاتصال أو الخادم */
export const isSessionError = (error: unknown) => {
  const e = (error ?? {}) as { message?: string; code?: string; name?: string };
  const code = String(e.code ?? "");
  const message = String(e.message ?? "");
  return /^PGRST30[123]$/.test(code)
    || e.name === "AuthSessionMissingError"
    || (code === "42501" && /permission denied for function/i.test(message))
    || /jwt expired|invalid jwt|invalid refresh token|refresh token not found/i.test(message);
};

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: STORAGE_KEY,
        storage: sessionStore(),
        // اللوحة لا تستقبل روابط دخول: لا تُقبل جلسة من رابط (#access_token=...)
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/* ═══════════════════════ الأنواع ═══════════════════════ */

export type CompanyStatus = "pending" | "active" | "suspended" | "rejected";

export type CompanyRow = {
  id: string;
  code: number;
  name_ar: string;
  name_en: string;
  status: CompanyStatus;
  status_reason: string;
  owner_email: string;
  vat_number: string;
  cr_number: string;
  phone: string;
  city: string;
  employees: number;
  users: number;
  sales_invoices: number;
  created_at: string;
  approved_at: string | null;
};

export type CompanyDetails = {
  id: string;
  code: number;
  name_ar: string;
  name_en: string;
  vat_number: string;
  cr_number: string;
  phone: string;
  email: string;
  country: string;
  region: string;
  employees_range: string | null;
  city: string;
  address_ar: string;
  address_en: string;
  bank_name: string;
  iban: string;
  logo_url: string;
  employee_email_domain: string;
  contact_name: string;
  owner_email: string;
  owner_user_id: string | null;
  status: CompanyStatus;
  status_reason: string;
  created_at: string;
  approved_at: string | null;
  seeded_at: string | null;
};

export type EditableCompany = Pick<
  CompanyDetails,
  | "name_ar" | "name_en" | "vat_number" | "cr_number" | "phone" | "email" | "city" | "region"
  | "address_ar" | "address_en" | "bank_name" | "iban" | "contact_name" | "employee_email_domain"
>;

export type NewCompany = EditableCompany & { owner_email: string; country: string };

export type MemberRow = {
  user_id: string;
  email: string | null;
  member_role: "owner" | "member";
  status: "active" | "disabled";
  created_at: string;
};

export type AuditRow = {
  id: number;
  created_at: string;
  actor_email: string;
  action: string;
  company_id: string | null;
  company_code: number | null;
  company_name: string | null;
  details: Record<string, unknown>;
};

/** حالة الاشتراك للعرض (subscription_state في القاعدة) */
export type SubState =
  | "trial" | "trial_expired" | "active" | "past_due" | "grace" | "cancelled" | "expired" | "read_only" | "complimentary" | "none";

export type SubStatus = "trialing" | "active" | "past_due" | "read_only" | "cancelled" | "complimentary";
export type Cycle = "monthly" | "yearly";

export type Usage = { users: number; employees: number; branches: number; sales_invoices: number };

export type TenantRow = {
  id: string;
  code: number;
  name_ar: string;
  status: CompanyStatus;
  owner_email: string;
  country: string;
  region: string;
  phone: string;
  vat_number: string;
  created_at: string;
  approved_at: string | null;
  plan_code: string | null;
  plan_name: string | null;
  sub_status: SubStatus | null;
  state: SubState;
  access: "full" | "read_only";
  trial_ends_at: string | null;
  current_period_end: string | null;
  billing_cycle: Cycle | null;
  balance: number;
  usage: Usage;
  open_request: boolean;
};

export type TenantFilter =
  | "all" | "pending" | "active" | "suspended" | "rejected"
  | "trial" | "trial_ending" | "read_only" | "paying" | "past_due" | "complimentary" | "balance" | "requests";

export type SaasStats = {
  mrr: number;
  arr: number;
  companies: number;
  pending: number;
  active_companies: number;
  suspended: number;
  trialing: number;
  trials_ending: number;
  paying: number;
  complimentary: number;
  read_only: number;
  past_due: number;
  outstanding: number;
  revenue_month: number;
  open_requests: number;
  new_30d: number;
  converted: number;
  trials_finished: number;
  by_plan: Array<{ code: string; name_ar: string; subscribers: number; paying: number }>;
  users: number;
  employees: number;
  sales_invoices: number;
};

export type Plan = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  price_monthly: number;
  price_yearly: number;
  max_users: number | null;
  max_employees: number | null;
  max_branches: number | null;
  modules: string[];
  features: string[];
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
  subscribers: number;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  company_id: string;
  number: string;
  plan_id: string | null;
  description: string;
  period_start: string | null;
  period_end: string | null;
  subtotal: number;
  discount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  status: "issued" | "paid" | "void";
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  void_reason: string;
  seller: Record<string, string>;
  buyer: Record<string, string | number>;
  paid_amount: number;
  company_code?: number;
  company_name?: string;
};

export type Payment = {
  id: string;
  company_id: string;
  invoice_id: string | null;
  amount: number;
  method: string;
  reference: string;
  received_at: string;
  notes: string;
  voided_at: string | null;
  void_reason: string;
  created_at: string;
  invoice_number: string | null;
  company_code?: number;
  company_name?: string;
};

export type Adjustment = { id: string; company_id: string; amount: number; reason: string; created_at: string };

export type SubRequest = {
  id: string;
  company_id: string;
  plan_id: string;
  billing_cycle: Cycle;
  note: string;
  status: "open" | "done" | "cancelled";
  response: string;
  created_at: string;
  handled_at: string | null;
  plan_code: string;
  plan_name: string;
  company_code?: number;
  company_name?: string;
  state?: SubState;
};

export type SubPlan = Pick<Plan, "code" | "name_ar" | "name_en" | "price_monthly" | "price_yearly" | "max_users" | "max_employees" | "max_branches" | "modules" | "features">;

export type SubscriptionDetails = {
  status: SubStatus | "none";
  state: SubState;
  access: "full" | "read_only";
  billing_cycle?: Cycle;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  grace_days?: number;
  ends_at?: string | null;
  days_left?: number | null;
  price_override?: number | null;
  plan?: SubPlan;
  usage?: Usage;
  balance?: number | null;
  currency?: string;
  vat_rate?: number;
  notes?: string | null;
  invoices?: Invoice[];
  payments?: Payment[];
  adjustments?: Adjustment[];
  requests?: SubRequest[];
};

export type PlatformSettings = {
  trial_days: number;
  grace_days: number;
  default_plan_code: string;
  vat_rate: number;
  currency: string;
  invoice_issuer: { name_ar?: string; vat_number?: string; cr_number?: string; address_ar?: string; bank_name?: string; iban?: string };
  support: { email?: string; phone?: string; whatsapp?: string };
  payment_instructions: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  level: "info" | "success" | "warning";
  audience: "all" | "trialing" | "active" | "read_only";
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type ActivateInput = {
  plan_code: string;
  billing_cycle: Cycle;
  periods: number;
  start: "now" | "after_current";
  price_override: string;
  discount: string;
  issue_invoice: boolean;
  payment_amount: string;
  payment_method: string;
  payment_reference: string;
  payment_date: string;
  note: string;
};

/* ═══════════════════════ الأخطاء ═══════════════════════ */

const ERRORS: Record<string, string> = {
  PLATFORM_ADMIN_REQUIRED: "هذا الحساب ليس مدير منصة (أضفه في جدول platform_admins)",
  COMPANY_NOT_FOUND: "المنشأة غير موجودة",
  COMPANY_NOT_PENDING: "المنشأة ليست بانتظار الموافقة",
  COMPANY_NOT_ACTIVE: "المنشأة ليست فعالة",
  COMPANY_NOT_SUSPENDED: "المنشأة ليست موقوفة",
  COMPANY_NAME_REQUIRED: "اسم المنشأة بالعربية مطلوب",
  COMPANY_COUNTRY_INVALID: "الدولة غير صحيحة",
  COMPANY_REGION_INVALID: "المنطقة 100 حرف على الأكثر",
  OWNER_EMAIL_INVALID: "بريد صاحب المنشأة غير صحيح",
  OWNER_EMAIL_ALREADY_MEMBER: "بريد صاحب المنشأة مرتبط بمنشأة أخرى",
  COMPANY_VAT_INVALID: "الرقم الضريبي غير صحيح لدولة المنشأة (السعودية: 15 رقمًا يبدأ وينتهي بالرقم 3)",
  COMPANY_CR_INVALID: "السجل التجاري غير صحيح لدولة المنشأة (السعودية: 10 أرقام)",
  MEMBER_NOT_FOUND: "العضو غير موجود",
  MEMBER_STATUS_INVALID: "حالة العضو غير صحيحة",
  MEMBER_REMOVE_REQUIRES_DISABLED_MEMBER: "الإزالة لعضو معطّل فقط (وليس صاحب المنشأة)",
  MEMBER_HAS_LINKS: "للعضو حساب مرتبط بموظف أو مستخدم خاص في المنشأة؛ تفك المنشأة الربط أولًا",
  LOGIN_NOT_AVAILABLE: "حساب الدخول مستخدم في منشأة أخرى",
  companies_vat_uidx: "الرقم الضريبي مسجّل لمنشأة أخرى",
  companies_email_domain_uidx: "نطاق البريد الداخلي مستخدم لمنشأة أخرى",
  companies_owner_email_uidx: "بريد صاحب المنشأة مسجّل لمنشأة أخرى",
  companies_domain_check: "نطاق البريد الداخلي غير صحيح (مثل company.com)",
  companies_vat_check: "الرقم الضريبي غير صحيح",
  // S15: الاشتراكات والفوترة
  SUBSCRIPTION_NOT_FOUND: "لا اشتراك لهذه المنشأة بعد (يبدأ عند الموافقة عليها)",
  EXTEND_DAYS_INVALID: "عدد الأيام من 1 إلى 365",
  SUBSCRIPTION_COMPLIMENTARY: "الاشتراك مجاني دائم؛ لا يحتاج تمديدًا",
  SUBSCRIPTION_STATUS_INVALID: "حالة الاشتراك غير صحيحة",
  SUBSCRIPTION_PERIOD_REQUIRED: "لا فترة مدفوعة لهذه المنشأة؛ فعّل اشتراكًا أولًا",
  SUBSCRIPTION_PERIOD_EXPIRED: "الفترة المدفوعة انتهت (وانتهت مهلتها)؛ استخدم «تمديد» أو «تفعيل أو تجديد اشتراك»",
  PLAN_CODE_EXISTS: "يوجد باقة بهذا الرمز؛ اختر رمزًا آخر أو عدّل الباقة الموجودة",
  PLAN_NOT_FOUND: "الباقة غير موجودة أو معطّلة",
  BILLING_CYCLE_INVALID: "اختر الدورة: شهرية أو سنوية",
  PERIODS_INVALID: "عدد الفترات من 1 إلى 36",
  AMOUNT_INVALID: "المبلغ غير صحيح",
  INVOICE_DESCRIPTION_REQUIRED: "وصف الفاتورة مطلوب",
  INVOICE_NOT_FOUND: "الفاتورة غير موجودة أو ملغاة",
  INVOICE_ALREADY_VOID: "الفاتورة ملغاة من قبل",
  INVOICE_HAS_PAYMENTS: "على الفاتورة دفعات؛ ألغِ الدفعات أولًا",
  REASON_REQUIRED: "اكتب السبب",
  PAYMENT_NOT_FOUND: "الدفعة غير موجودة",
  PAYMENT_ALREADY_VOID: "الدفعة ملغاة من قبل",
  PAYMENT_METHOD_INVALID: "طريقة الدفع غير صحيحة",
  PLAN_CODE_INVALID: "رمز الباقة: حروف إنجليزية صغيرة وأرقام و - أو _ (من 2 إلى 30)",
  PLAN_NAME_REQUIRED: "اسم الباقة بالعربية مطلوب",
  PLAN_MODULE_INVALID: "قسم غير معروف في الباقة",
  // S19: أقسام الباقة واستثناء المنشأة
  PLAN_HOTEL_REQUIRES_ACCOUNTING: "الحجوزات إضافة على المحاسبة والمالية؛ اختر المحاسبة والمالية معها",
  MODULE_HOTEL_REQUIRES_ACCOUNTING: "الحجوزات تتطلب المحاسبة والمالية للمنشأة نفسها",
  MODULE_OVERRIDES_INVALID: "قيم الاستثناء غير صحيحة",
  MODULE_CODE_INVALID: "قسم غير معروف",
  platform_get_company_modules: "دوال الأقسام غير مطبّقة على القاعدة؛ طبّق S19-saas-company-modules.sql أولًا",
  PLAN_FEATURES_INVALID: "المزايا 20 سطرًا على الأكثر",
  PLAN_LIMIT_INVALID: "الحدود أرقام موجبة (أو فارغة = بلا حد)",
  PLAN_IS_DEFAULT: "هذه باقة التجربة الافتراضية؛ غيّر الباقة الافتراضية في الإعدادات قبل تعطيلها",
  SETTING_TRIAL_DAYS_INVALID: "أيام التجربة رقم صحيح من 1 إلى 90",
  SETTING_GRACE_DAYS_INVALID: "مهلة السماح رقم صحيح من 0 إلى 30",
  SETTING_VAT_INVALID: "نسبة الضريبة من 0 إلى 100",
  SETTING_CURRENCY_INVALID: "العملة ثلاثة أحرف إنجليزية كبيرة (مثل SAR)",
  SETTING_INVALID: "قيمة إعداد غير صحيحة",
  SETTING_UNKNOWN: "إعداد غير معروف",
  ANNOUNCEMENT_TITLE_REQUIRED: "عنوان الإعلان مطلوب",
  ANNOUNCEMENT_INVALID: "نوع الإعلان أو جمهوره غير صحيح",
  ANNOUNCEMENT_DATES_INVALID: "نهاية الإعلان يجب أن تكون بعد بدايته",
  ANNOUNCEMENT_NOT_FOUND: "الإعلان غير موجود",
  REQUEST_STATUS_INVALID: "حالة الطلب غير صحيحة",
  REQUEST_NOT_OPEN: "الطلب لم يعد مفتوحًا",
  "invalid input syntax": "قيمة غير صحيحة في أحد الحقول الرقمية أو التواريخ",
  platform_list_error: "دوال سجل الأخطاء غير مطبّقة على القاعدة؛ طبّق S16-saas-error-logging.sql أولًا",
  ERROR_FILTER_REQUIRED: "حدّد الخطأ أو رقمه أو المنشأة",
  "statement timeout": "استغرق الاستعلام وقتًا طويلًا؛ اختر مدة أقصر أو صفِّ بالمصدر",
  "Could not find the function": "دوال S15 غير مطبّقة على القاعدة؛ طبّق S15-saas-subscriptions.sql أولًا",
};

// S16: أخطاء النظام (app_error_logs)
export type ErrorSource = "web" | "portal" | "edge";
export type ErrorLevel = "warn" | "error" | "fatal";
export type ErrorFilter = { days?: number; source?: ErrorSource | ""; company_id?: string; q?: string };
export type ErrorGroup = {
  fingerprint: string; count: number; users: number; companies: number; company_names: string[];
  first_seen: string; last_seen: string; level: ErrorLevel; source: ErrorSource; event: string;
  error_type: string; message: string; route: string; app_version: string; last_request_id: string;
};
export type ErrorGroupsResult = {
  days: number; total: number; last_24h: number; groups_total: number; companies_total: number; groups: ErrorGroup[];
};
export type ErrorRow = {
  id: number; created_at: string; last_at: string; source: ErrorSource; level: ErrorLevel; event: string; request_id: string;
  repeats: number; repeat_ids: string[]; matched_repeat: boolean;
  route: string; app_version: string; error_type: string; message: string; stack: string;
  context: Record<string, string | number | boolean>; user_agent: string; client_ip: string; fingerprint: string;
  company_id: string | null; company_code: number | null; company_name: string | null;
  user_id: string | null; user_email: string | null;
};
export const ERROR_SOURCE_LABELS: Record<ErrorSource, string> = { web: "النظام", portal: "بوابة الموظف", edge: "دوال الخادم" };

export function errorText(error: unknown): string {
  const message = String((error as { message?: string } | null)?.message ?? error ?? "");
  const key = Object.keys(ERRORS).find((code) => message.includes(code));
  return key ? ERRORS[key] : message || "حدث خطأ غير متوقع";
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(name, args ?? {});
  if (error) throw error;
  return data as T;
}

const trimAll = <T extends Record<string, string>>(values: T): T =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value ?? "").trim()])) as T;

export const api = {
  isPlatformAdmin: () => rpc<boolean>("is_platform_admin"),
  // المنشآت
  listCompanies: (status: CompanyStatus | null) => rpc<CompanyRow[]>("platform_list_companies", { p_status: status }),
  getCompany: (id: string) => rpc<CompanyDetails>("platform_get_company", { p_company: id }),
  approve: (id: string) => rpc<{ code: number; owner_emp_id: string | null }>("platform_approve_company", { p_company: id }),
  reject: (id: string, reason: string) => rpc<void>("platform_reject_company", { p_company: id, p_reason: reason }),
  suspend: (id: string, reason: string) => rpc<void>("platform_suspend_company", { p_company: id, p_reason: reason }),
  reactivate: (id: string) => rpc<void>("platform_reactivate_company", { p_company: id }),
  createCompany: (values: NewCompany) =>
    rpc<{ id: string; code: number; owner_emp_id: string | null }>("platform_create_company", { p: trimAll(values) }),
  updateCompany: (id: string, values: EditableCompany) => rpc<void>("platform_update_company", { p_company: id, p: trimAll(values) }),
  listMembers: (id: string) => rpc<MemberRow[]>("platform_list_members", { p_company: id }),
  setMemberStatus: (userId: string, status: "active" | "disabled") =>
    rpc<string>("platform_set_member_status", { p_user: userId, p_status: status }),
  removeMember: (userId: string) => rpc<void>("platform_remove_member", { p_user: userId }),
  audit: (companyId: string | null, limit = 200) => rpc<AuditRow[]>("platform_list_audit", { p_company: companyId, p_limit: limit }),
  // S15: الاشتراكات
  saasStats: () => rpc<SaasStats>("platform_saas_stats"),
  // S16: أخطاء النظام
  errorGroups: (filter: ErrorFilter) => rpc<ErrorGroupsResult>("platform_list_error_groups", { p: filter }),
  errors: (filter: { fingerprint?: string; request_id?: string; company_id?: string; days?: number }) =>
    rpc<ErrorRow[]>("platform_list_errors", { p: filter }),
  listTenants: (filter: TenantFilter) => rpc<TenantRow[]>("platform_list_tenants", { p_filter: filter }),
  getSubscription: (id: string) => rpc<SubscriptionDetails>("platform_get_subscription", { p_company: id }),
  extend: (id: string, days: number, note: string) =>
    rpc<SubscriptionDetails>("platform_extend_subscription", { p_company: id, p_days: days, p_note: note }),
  changePlan: (id: string, planCode: string, note: string) =>
    rpc<SubscriptionDetails>("platform_change_plan", { p_company: id, p_plan_code: planCode, p_note: note }),
  activate: (id: string, input: ActivateInput) =>
    rpc<SubscriptionDetails>("platform_activate_subscription", { p_company: id, p: { ...input, periods: String(input.periods) } }),
  setStatus: (id: string, status: "read_only" | "complimentary" | "cancelled" | "active" | "past_due", note: string) =>
    rpc<SubscriptionDetails>("platform_set_subscription_status", { p_company: id, p_status: status, p_note: note }),
  saveNotes: (id: string, notes: string) => rpc<void>("platform_save_subscription_notes", { p_company: id, p_notes: notes }),
  issueInvoice: (id: string, p: Record<string, string>) => rpc<SubscriptionDetails>("platform_issue_invoice", { p_company: id, p }),
  voidInvoice: (invoiceId: string, reason: string) => rpc<SubscriptionDetails>("platform_void_invoice", { p_invoice: invoiceId, p_reason: reason }),
  recordPayment: (id: string, p: Record<string, string>) => rpc<SubscriptionDetails>("platform_record_payment", { p_company: id, p }),
  voidPayment: (paymentId: string, reason: string) => rpc<SubscriptionDetails>("platform_void_payment", { p_payment: paymentId, p_reason: reason }),
  addAdjustment: (id: string, amount: number, reason: string) =>
    rpc<SubscriptionDetails>("platform_add_adjustment", { p_company: id, p_amount: amount, p_reason: reason }),
  listInvoices: (status: "all" | "issued" | "paid" | "void", limit = 500) =>
    rpc<Invoice[]>("platform_list_billing", { p_kind: status === "all" ? "invoices" : status, p_limit: limit }),
  listPayments: (limit = 500) => rpc<Payment[]>("platform_list_billing", { p_kind: "payments", p_limit: limit }),
  listPlans: () => rpc<Plan[]>("platform_list_plans"),
  // S19: أقسام المنشأة واستثناؤها (null أو غياب المفتاح = حسب الباقة)
  getCompanyModules: (id: string) => rpc<CompanyModules>("platform_get_company_modules", { p_company: id }),
  setCompanyModules: (id: string, overrides: Partial<Record<ModuleCode, boolean | null>>, note: string) =>
    rpc<CompanyModules>("platform_set_company_modules", { p_company: id, p_overrides: overrides, p_note: note }),
  savePlan: (p: Record<string, unknown>) => rpc<Plan[]>("platform_save_plan", { p }),
  getSettings: () => rpc<PlatformSettings>("platform_get_settings"),
  saveSettings: (p: Partial<PlatformSettings>) => rpc<PlatformSettings>("platform_save_settings", { p }),
  listAnnouncements: () => rpc<Announcement[]>("platform_list_announcements"),
  saveAnnouncement: (p: Record<string, unknown>) => rpc<Announcement[]>("platform_save_announcement", { p }),
  deleteAnnouncement: (id: string) => rpc<Announcement[]>("platform_delete_announcement", { p_id: id }),
  listRequests: (status: "open" | "done" | "cancelled" | "all") => rpc<SubRequest[]>("platform_list_requests", { p_status: status }),
  resolveRequest: (id: string, status: "done" | "cancelled", response: string) =>
    rpc<SubRequest[]>("platform_resolve_request", { p_id: id, p_status: status, p_response: response }),
};

/* ═══════════════════════ التسميات والتنسيق ═══════════════════════ */

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  pending: "بانتظار الموافقة",
  active: "فعالة",
  suspended: "موقوفة",
  rejected: "مرفوضة",
};

export const STATE_LABELS: Record<SubState, string> = {
  trial: "تجربة",
  trial_expired: "انتهت التجربة",
  active: "مشترك",
  past_due: "متأخر السداد",
  grace: "مهلة التجديد",
  cancelled: "لن يتجدد",
  expired: "منتهٍ",
  read_only: "قراءة فقط",
  complimentary: "مجاني",
  none: "بلا اشتراك",
};

/** لون الحالة: يطابق فئات CSS ‎.pill-*‎ */
export const STATE_TONE: Record<SubState, "info" | "ok" | "warn" | "danger" | "muted" | "gold"> = {
  trial: "info",
  trial_expired: "danger",
  active: "ok",
  past_due: "warn",
  grace: "warn",
  cancelled: "muted",
  expired: "danger",
  read_only: "danger",
  complimentary: "gold",
  none: "muted",
};

/**
 * S19: أقسام الباقة ثلاثة. الحجوزات إضافة على المحاسبة والمالية (لا تعمل بدونها).
 * المتاح لكل منشأة دائمًا: لوحة التحكم، والإعدادات، والمستخدمون والأدوار، والأسطول، والمهام، والدعم، والاشتراك.
 */
export type ModuleCode = "accounting" | "hr" | "hotel";
export const MODULES: Array<{ code: ModuleCode; label: string; hint: string }> = [
  { code: "accounting", label: "المحاسبة والمالية", hint: "المبيعات والمشتريات والمخزون والعملاء والموردون والحسابات والضرائب والأصول" },
  { code: "hr", label: "الموارد البشرية", hint: "الموظفون والحضور والإجازات والرواتب وبوابة الموظف" },
  { code: "hotel", label: "الحجوزات", hint: "الفنادق والشقق: الوحدات والحجز والاستقبال والمغادرة؛ تتطلب المحاسبة والمالية" },
];
export const moduleLabel = (code: string) => MODULES.find((m) => m.code === code)?.label ?? code;

/** S19: أقسام منشأة: أقسام باقتها مع استثنائها */
export type CompanyModules = {
  plan_code: string | null;
  plan_name: string | null;
  plan_modules: ModuleCode[];
  overrides: Partial<Record<ModuleCode, boolean>>;
  modules: ModuleCode[];
};

export const PAYMENT_METHODS: Array<{ code: string; label: string }> = [
  { code: "bank_transfer", label: "تحويل بنكي" },
  { code: "cash", label: "نقدًا" },
  { code: "card", label: "بطاقة" },
  { code: "online", label: "دفع إلكتروني" },
  { code: "other", label: "أخرى" },
];
export const paymentMethodLabel = (code: string) => PAYMENT_METHODS.find((m) => m.code === code)?.label ?? code;

export const INVOICE_STATUS: Record<Invoice["status"], string> = { issued: "غير مدفوعة", paid: "مدفوعة", void: "ملغاة" };

export const AUDIENCE_LABELS: Record<Announcement["audience"], string> = {
  all: "كل المنشآت",
  trialing: "المنشآت في التجربة",
  active: "المشتركون",
  read_only: "منشآت القراءة فقط",
};

export const ACTION_LABELS: Record<string, string> = {
  company_registered: "تسجيل منشأة",
  company_approved: "موافقة",
  company_rejected: "رفض",
  company_suspended: "إيقاف",
  company_reactivated: "إعادة تفعيل",
  company_created: "إنشاء من المنصة",
  company_updated: "تعديل بيانات",
  company_profile_updated: "تعديل من المنشأة",
  owner_linked: "ربط صاحب المنشأة",
  company_data_reset: "تفريغ بيانات المنشأة",
  member_active: "تفعيل عضو",
  member_disabled: "تعطيل عضو",
  member_removed: "إزالة عضو",
  subscription_trial_started: "بدء التجربة",
  subscription_trial_extended: "تمديد التجربة",
  subscription_period_extended: "تمديد الفترة",
  subscription_plan_changed: "تغيير الباقة",
  subscription_activated: "تفعيل اشتراك",
  subscription_status_read_only: "قراءة فقط",
  subscription_status_complimentary: "اشتراك مجاني",
  subscription_status_cancelled: "إلغاء التجديد",
  subscription_status_active: "إرجاع الاشتراك",
  subscription_status_past_due: "متأخر السداد",
  subscription_requested: "طلب اشتراك من المنشأة",
  subscription_request_done: "إغلاق طلب (تم)",
  subscription_request_cancelled: "إلغاء طلب",
  invoice_issued: "إصدار فاتورة",
  invoice_voided: "إلغاء فاتورة",
  payment_recorded: "تسجيل دفعة",
  payment_voided: "إلغاء دفعة",
  adjustment_recorded: "تسوية رصيد",
  plan_saved: "حفظ باقة",
  company_modules_changed: "تغيير أقسام المنشأة",
  settings_saved: "حفظ الإعدادات",
  announcement_saved: "حفظ إعلان",
  announcement_deleted: "حذف إعلان",
};

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "SA", name: "المملكة العربية السعودية" },
  { code: "AE", name: "الإمارات العربية المتحدة" },
  { code: "KW", name: "الكويت" },
  { code: "QA", name: "قطر" },
  { code: "BH", name: "البحرين" },
  { code: "OM", name: "عُمان" },
  { code: "EG", name: "مصر" },
  { code: "SD", name: "السودان" },
  { code: "JO", name: "الأردن" },
  { code: "IQ", name: "العراق" },
  { code: "YE", name: "اليمن" },
  { code: "LB", name: "لبنان" },
  { code: "SY", name: "سوريا" },
  { code: "PS", name: "فلسطين" },
  { code: "LY", name: "ليبيا" },
  { code: "TN", name: "تونس" },
  { code: "DZ", name: "الجزائر" },
  { code: "MA", name: "المغرب" },
  { code: "MR", name: "موريتانيا" },
  { code: "SO", name: "الصومال" },
  { code: "DJ", name: "جيبوتي" },
  { code: "KM", name: "جزر القمر" },
  { code: "SS", name: "جنوب السودان" },
  { code: "TR", name: "تركيا" },
  { code: "PK", name: "باكستان" },
  { code: "IN", name: "الهند" },
  { code: "BD", name: "بنغلاديش" },
  { code: "PH", name: "الفلبين" },
  { code: "ID", name: "إندونيسيا" },
  { code: "MY", name: "ماليزيا" },
  { code: "GB", name: "المملكة المتحدة" },
  { code: "US", name: "الولايات المتحدة" },
];
export const countryName = (code: string | null | undefined) =>
  COUNTRIES.find((c) => c.code === String(code ?? "").toUpperCase())?.name ?? String(code ?? "");

export const SAUDI_REGIONS: string[] = [
  "منطقة الرياض", "منطقة مكة المكرمة", "منطقة المدينة المنورة", "المنطقة الشرقية", "منطقة القصيم", "منطقة عسير", "منطقة تبوك",
  "منطقة حائل", "منطقة الحدود الشمالية", "منطقة جازان", "منطقة نجران", "منطقة الباحة", "منطقة الجوف",
];

export const formatDate = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";

export const formatDay = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", year: "numeric", month: "short", day: "numeric" }).format(new Date(value))
    : "—";

export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));

export const whole = (value: number | string | null | undefined) => new Intl.NumberFormat("en-US").format(Number(value ?? 0));

/** الأيام المتبقية حتى تاريخ (سالب إن مضى) */
export const daysUntil = (value: string | null | undefined) =>
  value ? Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000) : null;

/** العدد مع «يوم» بالعربية (مرفوع: «متبقٍ يومان») */
export const daysText = (n: number) => {
  const v = Math.abs(Math.trunc(n));
  if (v === 0) return "اليوم";
  if (v === 1) return "يوم واحد";
  if (v === 2) return "يومان";
  if (v <= 10) return `${v} أيام`;
  return `${v} يومًا`;
};
/** بعد حرف جر أو مضاف أو مفعول: «بعد يومين»، «تمديد يومين» */
export const daysTextGen = (n: number) => (Math.abs(Math.trunc(n)) === 2 ? "يومين" : daysText(n));

/** تاريخ اليوم بتوقيت الرياض (YYYY-MM-DD) لحقول التاريخ */
export const todayRiyadh = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
