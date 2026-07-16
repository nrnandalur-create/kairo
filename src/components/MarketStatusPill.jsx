import { useMarketStatus } from '../hooks/useMarketStatus'
import { useNow } from '../hooks/useNow'
import { fmtETClock } from '../utils/format'

// State → color tokens. Open is brand-green, after/pre is amber, closed is bear-red.
const COLOR = {
  open:   { dot: '#22B585', text: '#22B585', ring: 'rgba(29,158,117,0.55)' },
  pre:    { dot: '#e3a234', text: '#e3a234', ring: 'rgba(212,146,42,0.55)' },
  after:  { dot: '#e3a234', text: '#e3a234', ring: 'rgba(212,146,42,0.55)' },
  closed: { dot: '#ef5454', text: '#ef5454', ring: 'rgba(226,75,74,0.45)'  },
}

// Short labels for phones — the full "Market Closed" form is ~130px and crowds
// the header on a 375px screen. Below sm we show the compact form; the full
// label returns at sm+. Same info, colour dot unchanged.
const SHORT_LABEL = { open: 'OPEN', pre: 'PRE', after: 'AFT', closed: 'CLOSED' }

export default function MarketStatusPill({ compact = false }) {
  const { state, label } = useMarketStatus()
  const now = useNow(1000)              // live wall clock — 1Hz
  const c   = COLOR[state] ?? COLOR.closed
  const showClock = state !== 'closed'
  // Compact = drop the seconds from the clock; the label stays the full "Market Open"
  // form so users always know what they're looking at.
  const clockText = compact ? fmtETClock(now).replace(/:\d{2} /, ' ') : fmtETClock(now)

  return (
    <div
      className="glass flex items-center gap-2 px-2.5 py-1 rounded-full"
      title={`${label} · ${fmtETClock(now)}`}
    >
      <span className="relative flex h-2 w-2">
        {state === 'open' && (
          <span className="absolute inset-0 rounded-full animate-live-pulse" style={{ background: c.dot }} />
        )}
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: c.dot }} />
      </span>
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap" style={{ color: c.text }}>
        <span className="sm:hidden">{SHORT_LABEL[state] ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      {showClock && (
        <span className="hidden sm:inline-flex items-center gap-2">
          <span className="text-[var(--c-text-fainter)]">·</span>
          <span className="font-mono text-[11px] tabular-nums text-[var(--c-text-muted)]">{clockText}</span>
        </span>
      )}
    </div>
  )
}
