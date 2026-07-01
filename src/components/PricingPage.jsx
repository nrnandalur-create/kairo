import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useSubscription } from '../hooks/useSubscription'
import { startCheckout } from '../services/billing'
import KairoLogo from './KairoLogo'
import ProBadge from './ProBadge'

// The plans are display-only — the real prices come from Stripe once the
// user hits Checkout. Keep these numbers here in sync with the Stripe
// Product dashboard.
const MONTHLY = { amount: 12.99, cadence: '/mo',   label: 'Monthly' }
const ANNUAL  = { amount: 119,   cadence: '/yr',   label: 'Annual', savings: 'Save 24%' }

const PRO_FEATURES = [
  'Unlimited ticker searches',
  'Full AI Recommendation panel',
  'Detailed AI Analysis (per-indicator breakdown)',
  'Insider transactions + 90-day sentiment',
  'Options chain (calls + puts, OI, IV)',
  'Covered Call scanner with your position',
  'No delayed-data label',
]

const FREE_FEATURES = [
  '5 ticker searches per day',
  '1 AI Recommendation reveal per day',
  'Price chart + technical indicators',
  'News feed with sentiment',
  '15-min delayed data label',
]

export default function PricingPage({ onClose }) {
  const [interval, setInterval] = useState('monthly')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)
  const { user } = useAuth()
  const { isPro } = useSubscription()

  const active = interval === 'annual' ? ANNUAL : MONTHLY

  const goToCheckout = async () => {
    if (!user) {
      setError('Please sign in first to upgrade to Pro.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await startCheckout(interval)
    } catch (err) {
      setError(err?.message ?? 'Checkout failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col">
      {/* Slim header — logo + optional close */}
      <header className="border-b border-[var(--c-border)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => (onClose ? onClose() : window.location.assign('/'))}
            aria-label="Back to home"
            className="flex items-center gap-2 cursor-pointer"
          >
            <KairoLogo size={28} />
            <span className="font-serif font-bold text-lg text-[var(--c-text-strong)] tracking-tight">kairo</span>
          </button>
          <span className="ml-auto text-[10px] tracking-widest uppercase text-[var(--c-text-faint)]">Pricing</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center gap-8 py-10 sm:py-14 px-4">
        <div className="flex flex-col items-center gap-2 text-center max-w-2xl">
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--c-text-strong)] tracking-tight">
            Trade with a real specialist beside you
          </h1>
          <p className="text-[var(--c-text-faint)] text-[13px] sm:text-sm max-w-xl">
            Kairo Pro unlocks the full analyst stack — dual-prompt AI verdicts, per-indicator breakdowns, insider flow, and live options.
          </p>
        </div>

        {/* Monthly / annual toggle */}
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--c-input-bg)] border border-[var(--c-input-border)]">
          {['monthly', 'annual'].map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setInterval(v)}
              className={`text-[12px] font-semibold px-3 h-8 rounded-md transition-all duration-150 cursor-pointer ${
                interval === v
                  ? 'bg-[#22B585] text-white shadow-[0_0_8px_rgba(29,158,117,0.3)]'
                  : 'text-[var(--c-text-faint)] hover:text-[var(--c-text)]'
              }`}
            >
              {v === 'annual' ? 'Annual (save 24%)' : 'Monthly'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
          {/* Free plan */}
          <div className="glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Free</span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-[var(--c-text-strong)] tabular-nums">$0</span>
                <span className="text-[12px] text-[var(--c-text-faint)]">/forever</span>
              </div>
              <p className="text-[12px] text-[var(--c-text-faint)]">Kick the tires. No credit card.</p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {FREE_FEATURES.map(f => (
                <li key={f} className="text-[12.5px] text-[var(--c-text)]/80 flex items-start gap-2">
                  <span className="text-[var(--c-text-faint)] mt-0.5">•</span> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro plan */}
          <div
            className="rounded-xl p-4 sm:p-5 flex flex-col gap-4 border border-[#22B585]/30 bg-[#22B585]/[0.04]"
            style={{ boxShadow: '0 0 32px -12px rgba(29,158,117,0.35)' }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#22B585] uppercase tracking-[0.12em]">Kairo Pro</span>
                <ProBadge />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-[var(--c-text-strong)] tabular-nums">${active.amount}</span>
                <span className="text-[13px] text-[var(--c-text-faint)]">{active.cadence}</span>
                {interval === 'annual' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#e3a234]/12 text-[#e3a234] border border-[#e3a234]/25 ml-1 uppercase tracking-widest">
                    {ANNUAL.savings}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-[var(--c-text-faint)]">Cancel anytime from the customer portal.</p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {PRO_FEATURES.map(f => (
                <li key={f} className="text-[12.5px] text-[var(--c-text)] flex items-start gap-2">
                  <span className="text-[#22B585] mt-0.5">✓</span> {f}
                </li>
              ))}
            </ul>

            {isPro ? (
              <button
                type="button"
                onClick={() => window.location.assign('/account/billing')}
                className="mt-1 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] hover:border-[#22B585]/50 text-[var(--c-text)] font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Manage subscription
              </button>
            ) : (
              <button
                type="button"
                onClick={goToCheckout}
                disabled={busy}
                className="mt-1 bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-all duration-150 cursor-pointer"
              >
                {busy ? 'Redirecting to Stripe…' : `Upgrade — $${active.amount}${active.cadence}`}
              </button>
            )}

            {error && (
              <p className="text-[12px] text-[#ef5454] leading-relaxed">{error}</p>
            )}
          </div>
        </div>

        <p className="text-[11px] text-[var(--c-text-fainter)] max-w-xl text-center leading-relaxed">
          Payments processed by Stripe. Kairo never sees or stores your card details. Educational tool — not financial advice.
        </p>
      </main>
    </div>
  )
}
