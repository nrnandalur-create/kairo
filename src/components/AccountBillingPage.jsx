import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useSubscription } from '../hooks/useSubscription'
import { openBillingPortal } from '../services/billing'
import KairoLogo from './KairoLogo'
import ProBadge from './ProBadge'

function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

function StatusPill({ status }) {
  const cfg =
    status === 'active'   ? { label: 'Active',    color: '#22B585' } :
    status === 'past_due' ? { label: 'Past due',  color: '#ef5454' } :
    status === 'canceled' ? { label: 'Canceled',  color: '#e3a234' } :
    status === 'dev-override' ? { label: 'Dev override (Pro)', color: '#22B585' } :
                            { label: 'Free',      color: 'var(--c-text-faint)' }
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border"
      style={{ color: cfg.color, borderColor: `${cfg.color}55`, backgroundColor: `${cfg.color}18` }}
    >
      {cfg.label}
    </span>
  )
}

export default function AccountBillingPage() {
  const { user } = useAuth()
  const { isPro, isDevOverride, status, currentPeriodEnd, gracePeriodEnd, hasStripeCustomer, loading } = useSubscription()
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  const goToPortal = async () => {
    setBusy(true)
    setError(null)
    try {
      await openBillingPortal()
    } catch (err) {
      setError(err?.message ?? 'Could not open billing portal.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col">
      <header className="border-b border-[var(--c-border)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            aria-label="Back to home"
            className="flex items-center gap-2 cursor-pointer"
          >
            <KairoLogo size={28} />
            <span className="font-serif font-bold text-lg text-[var(--c-text-strong)] tracking-tight">kairo</span>
          </button>
          <span className="ml-auto text-[10px] tracking-widest uppercase text-[var(--c-text-faint)]">Account · Billing</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <div className="glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Current plan</span>
              {isPro && <ProBadge />}
            </div>
            <StatusPill status={status} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 p-3 rounded-xl border border-[var(--c-input-border)] bg-[var(--c-input-bg)]">
              <span className="text-[10px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Email</span>
              <span className="text-[13px] text-[var(--c-text)]">{user?.email ?? '—'}</span>
            </div>
            <div className="flex flex-col gap-1 p-3 rounded-xl border border-[var(--c-input-border)] bg-[var(--c-input-bg)]">
              <span className="text-[10px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">
                {status === 'canceled' ? 'Access until' : status === 'past_due' ? 'Grace period ends' : 'Renews on'}
              </span>
              <span className="text-[13px] tabular-nums text-[var(--c-text)]">
                {status === 'past_due' ? fmtDate(gracePeriodEnd) : fmtDate(currentPeriodEnd)}
              </span>
            </div>
          </div>

          {isDevOverride && (
            <div className="border border-[#22B585]/25 bg-[#22B585]/[0.06] rounded-lg p-3 flex gap-2 text-[11.5px] leading-relaxed text-[var(--c-text)]/85">
              <span className="text-[#22B585] shrink-0">ⓘ</span>
              <span>
                This account has permanent Pro entitlements via the developer override — independent of Stripe or the subscriptions table.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {hasStripeCustomer ? (
              <button
                type="button"
                onClick={goToPortal}
                disabled={busy}
                className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
              >
                {busy ? 'Opening portal…' : 'Manage subscription'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => window.location.assign('/pricing')}
                className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.98] text-white font-semibold text-sm px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
              >
                Upgrade to Pro
              </button>
            )}
            <span className="text-[11px] text-[var(--c-text-faint)]">
              Cancellation, plan changes, and receipts are all handled by Stripe's hosted portal.
            </span>
          </div>

          {error && (
            <p className="text-[12px] text-[#ef5454] leading-relaxed">{error}</p>
          )}
        </div>

        {loading && (
          <p className="text-[11px] text-[var(--c-text-fainter)]">Loading subscription…</p>
        )}
      </main>
    </div>
  )
}
