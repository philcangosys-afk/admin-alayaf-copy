import { useCallback, useEffect, useRef, useState } from "react";
import {
  ERROR_SOURCE_LABELS, api, errorText, formatDate,
  type ErrorGroup, type ErrorGroupsResult, type ErrorLevel, type ErrorRow, type ErrorSource,
} from "../api";
import { useShell } from "../shell";
import { Empty, Modal, useToast } from "../components/Ui";

const PERIODS: Array<{ days: number; label: string }> = [
  { days: 1, label: "24 ساعة" },
  { days: 7, label: "7 أيام" },
  { days: 30, label: "30 يومًا" },
  { days: 90, label: "90 يومًا" },
];
const SOURCES: Array<{ id: ErrorSource | ""; label: string }> = [
  { id: "", label: "كل المصادر" },
  { id: "web", label: ERROR_SOURCE_LABELS.web },
  { id: "portal", label: ERROR_SOURCE_LABELS.portal },
  { id: "edge", label: ERROR_SOURCE_LABELS.edge },
];
const LEVEL_LABELS: Record<ErrorLevel, string> = { fatal: "توقف", error: "خطأ", warn: "تحذير" };
const LEVEL_TONE: Record<ErrorLevel, string> = { fatal: "danger", error: "danger", warn: "warn" };

/** رقم الخطأ كما يراه المستخدم (الواجهة: E + 10، دوال الخادم: S + 12) */
const REQUEST_ID = /^[ES][0-9A-F]{10,12}$/i;

function LevelPill({ level }: { level: ErrorLevel }) {
  return <span className={`pill pill-${LEVEL_TONE[level] ?? "muted"}`}>{LEVEL_LABELS[level] ?? level}</span>;
}

/** تفاصيل الخطأ: كل مرة حدث فيها، بالمنشأة والمستخدم والصفحة والإصدار، والمسار عند الطلب */
function ErrorDetails({ title, filter, onClose }: { title: string; filter: { fingerprint?: string; request_id?: string }; onClose: () => void }) {
  const byId = Boolean(filter.request_id);
  const toast = useToast();
  const [rows, setRows] = useState<ErrorRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    api.errors({ ...filter, days: 90 })
      .then((data) => {
        if (!active) return;
        setRows(data);
        if (data.length) setOpen(data[0].id);
      })
      .catch((error) => {
        if (active) {
          setRows([]);
          toast("error", errorText(error));
        }
      });
    return () => { active = false; };
  }, [filter, toast]);

  return (
    <Modal title={title} onClose={onClose} wide>
      {rows === null ? (
        <p className="muted">جاري التحميل...</p>
      ) : rows.length === 0 ? (
        <Empty>
          {byId
            ? "لا يوجد خطأ بهذا الرقم في آخر 90 يومًا. ربما لم يُحفظ (انقطاع الاتصال، أو حد الأخطاء)؛ ابحث بنص الخطأ أو بالصفحة."
            : "لا توجد مرات لهذا الخطأ في آخر 90 يومًا."}
        </Empty>
      ) : (
        <div className="error-list">
          {rows.map((row) => (
            <div key={row.id} className={`error-item ${open === row.id ? "open" : ""}`}>
              <button type="button" className="error-item-head" onClick={() => setOpen(open === row.id ? null : row.id)} aria-expanded={open === row.id}>
                <span className="nowrap">{formatDate(row.created_at)}</span>
                <span className="mono" dir="ltr">{row.request_id}</span>
                <span>{row.company_code ? `${row.company_code} — ${row.company_name ?? ""}` : "بلا منشأة"}</span>
                <span className="muted" dir="ltr">{row.user_email ?? (row.user_id ? "حساب محذوف" : "غير مسجّل")}</span>
              </button>
              {open === row.id ? (
                <div className="error-item-body">
                  {row.matched_repeat && filter.request_id ? (
                    <div className="notice info">
                      الرقم <span className="mono" dir="ltr">{filter.request_id}</span> تكرار لهذا الخطأ من الجهة نفسها خلال دقائق، فحُفظ مع هذه المرة بلا صف جديد.
                    </div>
                  ) : null}
                  {row.repeats > 0 ? (
                    <p className="muted small">
                      تكرر بعدها {row.repeats} {row.repeats === 1 ? "مرة" : "مرات"}، آخرها {formatDate(row.last_at)}.
                    </p>
                  ) : null}
                  <div className="kv">
                    <div><span className="muted small">المصدر</span><div>{ERROR_SOURCE_LABELS[row.source] ?? row.source} · <LevelPill level={row.level} /></div></div>
                    <div><span className="muted small">الحدث</span><div className="mono" dir="ltr">{row.event}</div></div>
                    <div><span className="muted small">الصفحة أو الدالة</span><div className="mono" dir="ltr">{row.route || "—"}</div></div>
                    <div><span className="muted small">الإصدار</span><div className="mono" dir="ltr">{row.app_version || "—"}</div></div>
                    <div><span className="muted small">نوع الخطأ</span><div className="mono" dir="ltr">{row.error_type || "—"}</div></div>
                    <div><span className="muted small">العنوان</span><div className="mono" dir="ltr">{row.client_ip || "—"}</div></div>
                  </div>
                  <div className="error-message" dir="ltr">{row.message}</div>
                  {Object.keys(row.context ?? {}).length ? (
                    <div className="error-context" dir="ltr">
                      {Object.entries(row.context).map(([key, value]) => (
                        <span key={key} className="tag">{key}: {String(value)}</span>
                      ))}
                    </div>
                  ) : null}
                  {row.stack ? <pre className="error-stack" dir="ltr">{row.stack}</pre> : null}
                  {row.user_agent ? <p className="muted small" dir="ltr">{row.user_agent}</p> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** أخطاء النظام: من الواجهة وبوابة الموظف ودوال الخادم، مجمّعة بالخطأ نفسه */
export default function Errors() {
  const toast = useToast();
  const { tick } = useShell();
  const [days, setDays] = useState(7);
  const [source, setSource] = useState<ErrorSource | "">("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ErrorGroupsResult | null>(null);
  const [failed, setFailed] = useState("");
  const [details, setDetails] = useState<{ title: string; filter: { fingerprint?: string; request_id?: string } } | null>(null);
  // آخر طلب فقط يُعرض: رد بطيء لمدة سابقة لا يغطي رد المدة الحالية
  const lastLoad = useRef(0);

  // البحث يُرسل بعد توقف الكتابة
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const id = ++lastLoad.current;
    try {
      const next = await api.errorGroups({ days, source, q: query });
      if (id !== lastLoad.current) return;
      setResult(next);
      setFailed("");
    } catch (error) {
      if (id !== lastLoad.current) return;
      setResult(null);
      setFailed(errorText(error));
    }
  }, [days, source, query]);
  useEffect(() => { void load(); }, [load, tick]);

  const openByRequestId = () => {
    const id = search.trim().toUpperCase();
    if (REQUEST_ID.test(id)) setDetails({ title: `الخطأ ${id}`, filter: { request_id: id } });
    else toast("error", "رقم الخطأ يبدأ بـ E أو S ثم 10 إلى 12 خانة");
  };

  const groups = result?.groups ?? [];
  const distinct = result?.groups_total ?? groups.length;

  return (
    <>
      <section className="card">
        <div className="toolbar">
          <div className="chips" role="group" aria-label="المدة">
            {PERIODS.map((p) => (
              <button key={p.days} type="button" className={`chip ${days === p.days ? "active" : ""}`} onClick={() => setDays(p.days)}>{p.label}</button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="المصدر">
            {SOURCES.map((s) => (
              <button key={s.id || "all"} type="button" className={`chip ${source === s.id ? "active" : ""}`} onClick={() => setSource(s.id)}>{s.label}</button>
            ))}
          </div>
          <form className="row" onSubmit={(event) => { event.preventDefault(); openByRequestId(); }}>
            <input
              className="search"
              placeholder="رقم الخطأ (E…) أو نص منه"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="بحث برقم الخطأ أو نصه"
            />
            <button type="submit" className="btn btn-sm" disabled={!REQUEST_ID.test(search.trim())}>فتح الرقم</button>
          </form>
        </div>

        {failed ? <div className="card-pad"><div className="notice warn">{failed}</div></div> : null}

        {result ? (
          <div className="error-summary">
            <div><b>{result.total}</b><span>خطأ في المدة</span></div>
            <div><b>{distinct}</b><span>خطأ مختلف</span></div>
            <div><b>{result.companies_total ?? 0}</b><span>منشأة متأثرة</span></div>
            <div><b>{result.last_24h}</b><span>آخر 24 ساعة (الكل)</span></div>
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="error-col">الخطأ</th>
                <th>المصدر</th>
                <th className="num">مرات</th>
                <th className="num">مستخدمون</th>
                <th>المنشآت</th>
                <th>آخر مرة</th>
              </tr>
            </thead>
            <tbody>
              {failed && result === null ? (
                <tr><td colSpan={6}><Empty>تعذر تحميل الأخطاء؛ انظر الرسالة أعلاه.</Empty></td></tr>
              ) : result === null ? (
                <tr><td colSpan={6}><Empty>جاري التحميل...</Empty></td></tr>
              ) : groups.length === 0 ? (
                <tr><td colSpan={6}><Empty>{query ? "لا أخطاء تطابق البحث في هذه المدة." : "لا أخطاء في هذه المدة."}</Empty></td></tr>
              ) : groups.map((g: ErrorGroup) => (
                <tr key={g.fingerprint} className="clickable" onClick={() => setDetails({ title: g.event, filter: { fingerprint: g.fingerprint } })}>
                  <td className="error-col">
                    <div className="error-cell">
                      <LevelPill level={g.level} />
                      <div className="min0">
                        <div className="error-text" dir="ltr">{g.message}</div>
                        <div className="sub mono" dir="ltr">{g.event}{g.error_type ? ` · ${g.error_type}` : ""}{g.route ? ` · ${g.route}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{ERROR_SOURCE_LABELS[g.source] ?? g.source}</td>
                  <td className="num">{g.count}</td>
                  <td className="num">{g.users}</td>
                  <td className="small">{g.company_names.length ? g.company_names.join("، ") + (g.companies > g.company_names.length ? ` و${g.companies - g.company_names.length} غيرها` : "") : "—"}</td>
                  <td className="nowrap small">{formatDate(g.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {distinct > groups.length ? (
          <div className="card-pad"><p className="muted small">تُعرض أحدث {groups.length} من {distinct} خطأ مختلف؛ ضيّق المدة أو ابحث.</p></div>
        ) : null}
      </section>
      <p className="muted small">
        تُحفظ الأخطاء 90 يومًا. رقم الخطأ يظهر للمستخدم في شاشة الخطأ، ويعود من دوال الخادم في الترويسة X-Request-ID.
        الخطأ نفسه من الجهة نفسها (المستخدم، أو الزائر من العنوان نفسه، أو دالة الخادم للمنشأة والمستخدم نفسيهما) بعد 5 مرات
        في 10 دقائق (دوال الخادم: 20) يُحسب تكرارًا للمرة الأخيرة، ويُعثر عليه برقمه.
        الرسائل تُحفظ بعد إخفاء الرموز وكلمات المرور والبريد والآيبان والبطاقات والأرقام الطويلة.
      </p>
      {details ? <ErrorDetails title={details.title} filter={details.filter} onClose={() => setDetails(null)} /> : null}
    </>
  );
}
