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

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-[#1a2e1f] bg-[#0a100c]/70 backdrop-blur-sm"
      title={`${label} · ${fmtETClock(now)}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {state === 'open' && (
          <span className="absolute inset-0 rounded-full animate-live-pulse" style={{ background: c.dot }} />
        )}
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: c.dot }} />
      </span>
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: c.text }}>
        {compact ? label.replace('Market ', '') : label}
      </span>
      {showClock && (
        <>
          <span className="text-[#1a2e1f]">·</span>
          <span className="font-mono text-[10px] tabular-nums text-[#4b6358]">{fmtETClock(now)}</span>
        </>
      )}
    </div>
  )
}
