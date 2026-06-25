import { useMarketStatus } from '../hooks/useMarketStatus'
import { useNow } from '../hooks/useNow'
import { fmtETClock } from '../utils/format'

// State → color tokens. Open is brand-green, after/pre is amber, closed is bear-red.
const COLOR = {
  open:   { dot: '#1D9E75', text: '#1D9E75', ring: 'rgba(29,158,117,0.55)' },
  pre:    { dot: '#d4922a', text: '#d4922a', ring: 'rgba(212,146,42,0.55)' },
  after:  { dot: '#d4922a', text: '#d4922a', ring: 'rgba(212,146,42,0.55)' },
  closed: { dot: '#e24b4a', text: '#e24b4a', ring: 'rgba(226,75,74,0.45)'  },
}

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
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: c.text }}>
        {label}
      </span>
      {showClock && (
        <span className="hidden sm:inline-flex items-center gap-2">
          <span className="text-[#263d2c]">·</span>
          <span className="font-mono text-[11px] tabular-nums text-[#8a9b91]">{clockText}</span>
        </span>
      )}
    </div>
  )
}
