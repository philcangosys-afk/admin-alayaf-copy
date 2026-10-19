import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { STATE_LABELS, STATE_TONE, STATUS_LABELS, type CompanyStatus, type SubState } from "../api";

type ToastKind = "ok" | "error";
type Toast = { id: number; kind: ToastKind; text: string };

const ToastContext = createContext<(kind: ToastKind, text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const COMPANY_TONE: Record<CompanyStatus, string> = { pending: "warn", active: "ok", suspended: "danger", rejected: "muted" };

export function StatusBadge({ status }: { status: CompanyStatus }) {
  return <span className={`pill pill-${COMPANY_TONE[status] ?? "muted"}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function StatePill({ state }: { state: SubState }) {
  return <span className={`pill pill-${STATE_TONE[state] ?? "muted"}`}>{STATE_LABELS[state] ?? state}</span>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  ltr = false,
  required = false,
  placeholder,
  disabled = false,
  type = "text",
  hint,
  className,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ltr?: boolean;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "number" | "date" | "datetime-local" | "email";
  hint?: string;
  className?: string;
  inputMode?: "decimal" | "numeric" | "text" | "email";
  maxLength?: number;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>
        {label}
        {required ? <b className="req"> *</b> : null}
        {hint ? <span className="hint"> — {hint}</span> : null}
      </span>
      <input
        type={type}
        value={value}
        dir={ltr ? "ltr" : "rtl"}
        placeholder={placeholder}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
  disabled = false,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>
        {label}
        {required ? <b className="req"> *</b> : null}
        {hint ? <span className="hint"> — {hint}</span> : null}
      </span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  maxLength,
  required = false,
  placeholder,
  className,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>
        {label}
        {required ? <b className="req"> *</b> : null}
        {hint ? <span className="hint"> — {hint}</span> : null}
      </span>
      <textarea value={value} rows={rows} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function Meter({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const capped = limit ?? null;
  const ratio = capped ? Math.min(1, used / capped) : 0;
  const tone = capped !== null && used > capped ? "over" : capped !== null && (used >= capped || ratio >= 0.8) ? "warn" : "";
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{label}</span>
        <b>
          {used} <span className="muted">/ {capped === null ? "بلا حد" : capped}</span>
        </b>
      </div>
      <div className="meter-bar">
        <span className={tone} style={{ width: capped === null ? "100%" : `${Math.max(3, Math.round(ratio * 100))}%`, opacity: capped === null ? 0.3 : 1 }} />
      </div>
    </div>
  );
}

/** تأكيد إجراء، مع سبب إلزامي عند الحاجة */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  needReason = false,
  reasonLabel = "السبب (يظهر لصاحب المنشأة)",
  onConfirm,
  onClose,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  needReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (needReason && !reason.trim()) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      // الخطأ ظهر للمستخدم من الإجراء نفسه؛ تبقى النافذة مفتوحة لإعادة المحاولة أو الإلغاء
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={busy ? () => undefined : onClose}>
      <div className="muted">{message}</div>
      {needReason ? (
        <label className="field" style={{ marginTop: 12 }}>
          <span>{reasonLabel}<b className="req"> *</b></span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} />
        </label>
      ) : null}
      <div className="row-end">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        <button
          type="button"
          className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`}
          onClick={() => void submit()}
          disabled={busy || (needReason && !reason.trim())}
        >
          {busy ? "جاري التنفيذ..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
