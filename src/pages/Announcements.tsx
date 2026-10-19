import { useCallback, useEffect, useState } from "react";
import { api, AUDIENCE_LABELS, errorText, formatDate, type Announcement } from "../api";
import { useShell } from "../shell";
import { ConfirmDialog, Empty, Field, Modal, SelectField, TextArea, useToast } from "../components/Ui";

type Draft = { id: string; title: string; body: string; level: Announcement["level"]; audience: Announcement["audience"]; starts_at: string; ends_at: string; is_active: boolean };

/** datetime-local بتوقيت الجهاز ← ISO */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const LEVELS: Array<{ value: Announcement["level"]; label: string }> = [
  { value: "info", label: "معلومة" },
  { value: "success", label: "عرض أو خبر جيد" },
  { value: "warning", label: "تنبيه (صيانة أو تغيير)" },
];

/** إعلانات تظهر أعلى صفحات النظام للمنشآت حسب الجمهور والمدة */
export default function Announcements() {
  const toast = useToast();
  const { tick } = useShell();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.listAnnouncements());
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [toast]);
  useEffect(() => { void load(); }, [load, tick]);

  const save = async () => {
    if (!draft || !draft.title.trim()) return;
    setBusy(true);
    try {
      setRows(await api.saveAnnouncement({
        id: draft.id,
        title: draft.title.trim(),
        body: draft.body.trim(),
        level: draft.level,
        audience: draft.audience,
        starts_at: toIso(draft.starts_at),
        ends_at: toIso(draft.ends_at),
        is_active: draft.is_active,
      }));
      toast("ok", "حُفظ الإعلان");
      setDraft(null);
    } catch (error) {
      toast("error", errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();
  const live = (a: Announcement) => a.is_active && new Date(a.starts_at).getTime() <= now && (!a.ends_at || new Date(a.ends_at).getTime() > now);

  return (
    <>
      <div className="row">
        <span className="muted">يظهر الإعلان شريطًا أعلى صفحات النظام، ويستطيع المستخدم إخفاءه.</span>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setDraft({ id: "", title: "", body: "", level: "info", audience: "all", starts_at: toLocal(new Date().toISOString()), ends_at: "", is_active: true })}
        >
          إعلان جديد
        </button>
      </div>
      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>العنوان</th><th>الجمهور</th><th>المدة</th><th>الحالة</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5}><Empty>لا إعلانات.</Empty></td></tr>
              ) : rows.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.title}</b>{a.body ? <div className="sub">{a.body.slice(0, 140)}</div> : null}</td>
                  <td>{AUDIENCE_LABELS[a.audience]}</td>
                  <td className="nowrap">{formatDate(a.starts_at)}<div className="sub">{a.ends_at ? `حتى ${formatDate(a.ends_at)}` : "بلا نهاية"}</div></td>
                  <td>{live(a) ? <span className="pill pill-ok">ظاهر الآن</span> : !a.is_active ? <span className="pill pill-muted">موقوف</span> : <span className="pill pill-info">مجدول أو منتهٍ</span>}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="btn btn-sm" onClick={() => setDraft({ id: a.id, title: a.title, body: a.body, level: a.level, audience: a.audience, starts_at: toLocal(a.starts_at), ends_at: toLocal(a.ends_at), is_active: a.is_active })}>تعديل</button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => setRemoving(a)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {draft ? (
        <Modal title={draft.id ? "تعديل إعلان" : "إعلان جديد"} onClose={busy ? () => undefined : () => setDraft(null)}>
          <div className="grid-2">
            <Field label="العنوان" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} required className="span-2" maxLength={150} />
            <TextArea label="النص" value={draft.body} onChange={(v) => setDraft({ ...draft, body: v })} rows={3} maxLength={2000} className="span-2" />
            <SelectField label="النوع" value={draft.level} onChange={(v) => setDraft({ ...draft, level: v as Draft["level"] })} options={LEVELS} />
            <SelectField
              label="الجمهور"
              value={draft.audience}
              onChange={(v) => setDraft({ ...draft, audience: v as Draft["audience"] })}
              options={(Object.keys(AUDIENCE_LABELS) as Draft["audience"][]).map((k) => ({ value: k, label: AUDIENCE_LABELS[k] }))}
            />
            <Field label="يبدأ" value={draft.starts_at} onChange={(v) => setDraft({ ...draft, starts_at: v })} type="datetime-local" ltr />
            <Field label="ينتهي" value={draft.ends_at} onChange={(v) => setDraft({ ...draft, ends_at: v })} type="datetime-local" ltr hint="فارغ = بلا نهاية" />
          </div>
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> مفعّل
          </label>
          <div className="row-end">
            <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>إلغاء</button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !draft.title.trim()}>{busy ? "جاري الحفظ..." : "حفظ الإعلان"}</button>
          </div>
        </Modal>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="حذف إعلان"
          message={`سيُحذف «${removing.title}» ولا يظهر للمنشآت.`}
          confirmLabel="حذف"
          danger
          onConfirm={async () => {
            try { setRows(await api.deleteAnnouncement(removing.id)); toast("ok", "حُذف الإعلان"); } catch (e) { toast("error", errorText(e)); throw e; }
          }}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}
