import { useCallback, useEffect, useState } from "react";
import { api, daysText, daysUntil, errorText, formatDate, money, whole, type CompanyRow, type SubRequest, type TenantRow } from "../api";
import { useShell } from "../shell";
import { CompanyActionButtons, useCompanyAction } from "../components/Companies";
import { ExtendDialog } from "../components/SubscriptionDialogs";
import { Empty, StatePill, useToast } from "../components/Ui";

const PLAN_COLORS = ["#c9a24d", "#3fa483", "#7fb7d8", "#e2c98f", "#9fc2b3", "#d9896a"];

/**
 * الرئيسية: الإيراد الشهري المتكرر ومزيج الباقات، ثم ما يحتاج إجراءً اليوم:
 * طلبات التسجيل، والتجارب القريبة من الانتهاء، وطلبات الاشتراك، والأرصدة المستحقة.
 */
export default function Home() {
  const toast = useToast();
  const { stats, go, tick } = useShell();
  const [pending, setPending] = useState<CompanyRow[]>([]);
  const [ending, setEnding] = useState<TenantRow[]>([]);
  const [expired, setExpired] = useState<TenantRow[]>([]);
  const [requests, setRequests] = useState<SubRequest[]>([]);
  const [balances, setBalances] = useState<TenantRow[]>([]);
  const [extendFor, setExtendFor] = useState<TenantRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, e, ro, r, b] = await Promise.all([
        api.listCompanies("pending"),
        api.listTenants("trial_ending"),
        api.listTenants("read_only"),
        api.listRequests("open"),
        api.listTenants("balance"),
      ]);
      setPending(p);
      setEnding(e);
      setExpired(ro);
      setRequests(r);
      setBalances(b);
    } catch (error) {
      toast("error", errorText(error));
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load, tick]);
  const { dialog, open } = useCompanyAction(() => void load());

  const paying = stats?.by_plan.reduce((s, p) => s + Number(p.paying), 0) ?? 0;
  const conversion = stats && stats.trials_finished > 0 ? Math.round((stats.converted / stats.trials_finished) * 100) : null;

  const facts: Array<{ label: string; value: string; to?: string }> = stats
    ? [
        { label: "منشآت مشتركة", value: whole(stats.paying), to: "subscriptions/paying" },
        { label: "في الفترة التجريبية", value: whole(stats.trialing), to: "subscriptions/trial" },
        { label: "تجارب تنتهي خلال 3 أيام", value: whole(stats.trials_ending), to: "subscriptions/trial_ending" },
        { label: "للقراءة فقط", value: whole(stats.read_only), to: "subscriptions/read_only" },
        { label: "مستحقات على المنشآت", value: money(stats.outstanding), to: "subscriptions/balance" },
        { label: "محصّل هذا الشهر", value: money(stats.revenue_month), to: "billing" },
        { label: "التحويل من التجربة", value: conversion === null ? "—" : `${conversion}%` },
        { label: "منشآت جديدة (30 يومًا)", value: whole(stats.new_30d), to: "companies" },
        { label: "اشتراكات مجانية", value: whole(stats.complimentary), to: "subscriptions/complimentary" },
      ]
    : [];

  // التجارب المنتهية حديثًا (قراءة فقط) أولى من القديمة
  const trialsExpired = expired.filter((t) => t.state === "trial_expired").slice(0, 6);

  return (
    <>
      <section className="revenue" aria-label="الإيرادات">
        <div className="revenue-main">
          <div className="label">الإيراد الشهري المتكرر (قبل الضريبة)</div>
          <div className="value">{stats ? money(stats.mrr) : "—"}<small>ر.س</small></div>
          <div className="arr">سنويًا {stats ? money(stats.arr) : "—"} ر.س</div>
          {stats && stats.by_plan.length ? (
            <div className="plan-mix">
              <div className="plan-mix-bar" role="img" aria-label="توزيع المشتركين على الباقات">
                {paying > 0
                  ? stats.by_plan.map((p, i) => (p.paying > 0 ? <span key={p.code} style={{ width: `${(p.paying / paying) * 100}%`, background: PLAN_COLORS[i % PLAN_COLORS.length] }} /> : null))
                  : null}
              </div>
              <div className="plan-mix-legend">
                {stats.by_plan.map((p, i) => (
                  <span key={p.code}>
                    <i style={{ background: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                    {p.name_ar}: {p.paying} مشترك من {p.subscribers}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="revenue-facts">
          {facts.map((f) => (
            <div className="fact" key={f.label}>
              {f.to ? (
                <button type="button" onClick={() => go(f.to as string)}>
                  <b>{f.value}</b>
                  <span>{f.label}</span>
                </button>
              ) : (
                <>
                  <b>{f.value}</b>
                  <span>{f.label}</span>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="lanes">
        <section className="card lane">
          <div className="card-head">
            <h2>طلبات تسجيل بانتظار الموافقة <span className={`lane-count ${pending.length ? "hot" : ""}`}>{pending.length}</span></h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => go("companies")}>كل المنشآت</button>
          </div>
          {pending.length === 0 ? <Empty>لا طلبات جديدة.</Empty> : (
            <ul className="lane-list">
              {pending.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <div className="who">
                    <b><button type="button" className="link" onClick={() => go(`company/${c.id}`)}>{c.name_ar}</button></b>
                    <span dir="ltr">{c.owner_email}</span>، <span>{formatDate(c.created_at)}</span>
                  </div>
                  <div className="actions"><CompanyActionButtons company={c} status={c.status} open={open} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lane">
          <div className="card-head">
            <h2>تجارب تنتهي قريبًا <span className={`lane-count ${ending.length ? "hot" : ""}`}>{ending.length}</span></h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => go("subscriptions/trial")}>كل التجارب</button>
          </div>
          {ending.length === 0 && trialsExpired.length === 0 ? <Empty>لا تجارب تنتهي خلال 3 أيام.</Empty> : (
            <ul className="lane-list">
              {ending.map((t) => {
                const left = daysUntil(t.trial_ends_at) ?? 0;
                return (
                  <li key={t.id}>
                    <div className="who">
                      <b><button type="button" className="link" onClick={() => go(`company/${t.id}`)}>{t.name_ar}</button></b>
                      <span>{left <= 0 ? "تنتهي اليوم" : `متبقٍ ${daysText(left)}`}، باقة {t.plan_name}</span>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => setExtendFor(t)}>تمديد</button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => go(`company/${t.id}`)}>تفعيل</button>
                  </li>
                );
              })}
              {trialsExpired.map((t) => (
                <li key={t.id}>
                  <div className="who">
                    <b><button type="button" className="link" onClick={() => go(`company/${t.id}`)}>{t.name_ar}</button></b>
                    <span><StatePill state={t.state} /></span>
                  </div>
                  <button type="button" className="btn btn-sm" onClick={() => setExtendFor(t)}>تمديد</button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => go(`company/${t.id}`)}>تفعيل</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lane">
          <div className="card-head">
            <h2>طلبات اشتراك مفتوحة <span className={`lane-count ${requests.length ? "hot" : ""}`}>{requests.length}</span></h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => go("requests")}>كل الطلبات</button>
          </div>
          {requests.length === 0 ? <Empty>لا طلبات اشتراك مفتوحة.</Empty> : (
            <ul className="lane-list">
              {requests.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <div className="who">
                    <b>{r.company_name}</b>
                    <span>{r.plan_name}، {r.billing_cycle === "yearly" ? "سنوي" : "شهري"}، {formatDate(r.created_at)}</span>
                  </div>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => go(`company/${r.company_id}`)}>مراجعة وتفعيل</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lane">
          <div className="card-head">
            <h2>أرصدة مستحقة <span className="lane-count">{balances.length}</span></h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => go("billing")}>الفواتير</button>
          </div>
          {balances.length === 0 ? <Empty>لا مستحقات على المنشآت.</Empty> : (
            <ul className="lane-list">
              {balances.sort((a, b) => b.balance - a.balance).slice(0, 6).map((t) => (
                <li key={t.id}>
                  <div className="who">
                    <b><button type="button" className="link" onClick={() => go(`company/${t.id}/billing`)}>{t.name_ar}</button></b>
                    <span><StatePill state={t.state} /></span>
                  </div>
                  <b className="danger-text num">{money(t.balance)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {extendFor ? (
        <ExtendLoader tenant={extendFor} onClose={() => setExtendFor(null)} onDone={() => void load()} />
      ) : null}
      {dialog}
    </>
  );
}

/** نافذة التمديد تحتاج تفاصيل الاشتراك: تُحمَّل عند فتحها */
function ExtendLoader({ tenant, onClose, onDone }: { tenant: TenantRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { reloadStats } = useShell();
  const [sub, setSub] = useState<Awaited<ReturnType<typeof api.getSubscription>> | null>(null);
  useEffect(() => {
    api.getSubscription(tenant.id).then(setSub).catch((e) => { toast("error", errorText(e)); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);
  if (!sub) return null;
  return (
    <ExtendDialog
      companyId={tenant.id}
      sub={sub}
      onClose={onClose}
      onDone={() => { void reloadStats(); onDone(); }}
    />
  );
}
