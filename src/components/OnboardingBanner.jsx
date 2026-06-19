const STEPS = [
  {
    num: '01',
    label: 'Search a ticker',
    desc: 'Type any symbol — AAPL, SPY, NVDA — in the search bar above.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    num: '02',
    label: 'Bookmark to watchlist',
    desc: 'Click the bookmark icon on any stock to track it on your homepage.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 2h9a.5.5 0 01.5.5v12l-5-3-5 3V2.5a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    num: '03',
    label: 'Run AI analysis',
    desc: 'Get a BUY, SELL, or HOLD signal with entry price, stop loss, and risk level.',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
]

export default function OnboardingBanner({ onDismiss }) {
  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-5 flex flex-col gap-4 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]" />
          <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Get Started</span>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-[#263d2c] hover:text-[#4b6358] transition-colors p-1 -mr-1"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {STEPS.map((step, i) => (
          <div key={i} className="flex items-start gap-3 bg-[#080c0a] rounded-xl p-3.5">
            <div className="shrink-0 mt-0.5 text-[#1D9E75]">{step.icon}</div>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-[#263d2c] tabular-nums">{step.num}</span>
                <span className="text-xs font-semibold text-[#d1d9d5]">{step.label}</span>
              </div>
              <p className="text-[11px] text-[#4b6358] leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Dismiss link */}
      <button
        onClick={onDismiss}
        className="self-end text-[10px] text-[#263d2c] hover:text-[#4b6358] transition-colors"
      >
        Got it, don't show again →
      </button>
    </div>
  )
}
