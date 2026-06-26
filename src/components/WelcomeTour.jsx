import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const STORAGE_KEY = 'kairo_tour_seen'

const STEPS = [
  {
    eyebrow: 'Step 1 of 4',
    title: 'Search any ticker',
    body: 'Type a symbol or company name in the header search. Stocks, ETFs, ADRs — anything Finnhub or Yahoo recognizes works.',
    glyph: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M20.5 20.5L27 27" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    eyebrow: 'Step 2 of 4',
    title: 'Press ⌘K anywhere',
    body: 'The command palette gives you fast jump to ~170 tickers, your recent searches, and major sections (Screener, Portfolio, Sectors, Compare).',
    glyph: (
      <span className="font-mono text-xl font-black tracking-tight">⌘K</span>
    ),
  },
  {
    eyebrow: 'Step 3 of 4',
    title: 'Save tickers you care about',
    body: 'Hit the bookmark on the analyzed ticker page to add it to your Watchlist. Signed-in users get sync across devices plus signal-change emails.',
    glyph: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M7 4h18a1 1 0 011 1v23l-10-6-10 6V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    eyebrow: 'Step 4 of 4',
    title: 'Tune Settings to taste',
    body: 'Theme, refresh interval, stale-warning threshold, and glass translucency live in Settings (sidebar gear). Preferences are saved per device.',
    glyph: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M16 2v4M16 26v4M2 16h4M26 16h4M6 6l3 3M23 23l3 3M6 26l3-3M23 9l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function WelcomeTour({ open: openProp, onClose }) {
  // Auto-shows on first visit unless a parent passes `open` explicitly.
  const [autoOpen, setAutoOpen] = useState(false)
  const [step, setStep] = useState(0)
  const open = openProp ?? autoOpen

  useEffect(() => {
    if (openProp !== undefined) return
    if (typeof window === 'undefined') return
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setAutoOpen(true)
    } catch { /* private mode etc */ }
  }, [openProp])

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setAutoOpen(false)
    setStep(0)
    onClose?.()
  }

  if (!open) return null

  const cur = STEPS[step]
  const isLast = step === STEPS.length - 1

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-fade"
      style={{ background: 'var(--c-overlay)' }}
      onMouseDown={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Kairo"
        className="glass-strong relative w-full max-w-[460px] rounded-2xl overflow-hidden animate-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-5 px-6 pt-6 pb-5">
          {/* Glyph */}
          <div className="w-14 h-14 rounded-xl border border-[#22B585]/30 bg-[#22B585]/10 text-[#22B585] flex items-center justify-center self-start">
            {cur.glyph}
          </div>

          {/* Copy */}
          <div className="flex flex-col gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--c-text-faint)]">{cur.eyebrow}</span>
            <h2 className="text-lg font-bold tracking-tight text-[var(--c-text-strong)]">{cur.title}</h2>
            <p className="text-[13.5px] leading-relaxed text-[var(--c-text)]/85">{cur.body}</p>
          </div>

          {/* Step dots */}
          <div className="flex items-center gap-1.5 pt-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step
                    ? 'w-5 bg-[#22B585]'
                    : i < step
                    ? 'w-1.5 bg-[#22B585]/60'
                    : 'w-1.5 bg-[var(--c-border-strong)]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-[var(--c-glass-border)]">
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--c-text-faint)] hover:text-[var(--c-text)] cursor-pointer transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--c-border)] text-[var(--c-text)] hover:border-[var(--c-border-strong)] cursor-pointer transition-colors"
              >
                Back
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.96] text-white cursor-pointer transition-all duration-150"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.96] text-white cursor-pointer transition-all duration-150"
              >
                Let’s go
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
