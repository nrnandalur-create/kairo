const SIGNAL = {
  bullish: { dot: 'bg-[#1D9E75]', badge: 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25' },
  bearish: { dot: 'bg-[#e24b4a]', badge: 'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25' },
  neutral: { dot: 'bg-[#d4922a]', badge: 'bg-[#d4922a]/10 text-[#d4922a] border-[#d4922a]/25' },
}

// Tiny inline SVG candlestick illustrations keyed by lowercase pattern name fragments
const PATTERN_SVGS = {
  hammer: (
    <svg viewBox="0 0 32 48" width="20" height="30" fill="none">
      <line x1="16" y1="0"  x2="16" y2="12" stroke="#4b6358" strokeWidth="1.5" />
      <rect x="10" y="12" width="12" height="8" fill="#1D9E75" rx="1" />
      <line x1="16" y1="20" x2="16" y2="48" stroke="#1D9E75" strokeWidth="1.5" />
    </svg>
  ),
  'shooting star': (
    <svg viewBox="0 0 32 48" width="20" height="30" fill="none">
      <line x1="16" y1="0"  x2="16" y2="28" stroke="#e24b4a" strokeWidth="1.5" />
      <rect x="10" y="28" width="12" height="8" fill="#e24b4a" rx="1" />
      <line x1="16" y1="36" x2="16" y2="48" stroke="#4b6358" strokeWidth="1.5" />
    </svg>
  ),
  doji: (
    <svg viewBox="0 0 32 48" width="20" height="30" fill="none">
      <line x1="16" y1="0"  x2="16" y2="22" stroke="#4b6358" strokeWidth="1.5" />
      <rect x="8" y="22" width="16" height="4" fill="#d4922a" rx="1" />
      <line x1="16" y1="26" x2="16" y2="48" stroke="#4b6358" strokeWidth="1.5" />
    </svg>
  ),
  engulfing: (
    <svg viewBox="0 0 52 48" width="32" height="30" fill="none">
      <line x1="12" y1="4"  x2="12" y2="10" stroke="#e24b4a" strokeWidth="1.5" />
      <rect x="8"  y="10" width="8" height="20" fill="#e24b4a" rx="1" />
      <line x1="12" y1="30" x2="12" y2="36" stroke="#e24b4a" strokeWidth="1.5" />
      <line x1="36" y1="2"  x2="36" y2="8"  stroke="#1D9E75" strokeWidth="1.5" />
      <rect x="28" y="8"  width="16" height="32" fill="#1D9E75" rx="1" />
      <line x1="36" y1="40" x2="36" y2="46" stroke="#1D9E75" strokeWidth="1.5" />
    </svg>
  ),
  'morning star': (
    <svg viewBox="0 0 72 48" width="44" height="30" fill="none">
      <line x1="12" y1="2"  x2="12" y2="8"  stroke="#e24b4a" strokeWidth="1.5" />
      <rect x="8"  y="8"  width="8" height="24" fill="#e24b4a" rx="1" />
      <line x1="12" y1="32" x2="12" y2="38" stroke="#e24b4a" strokeWidth="1.5" />
      <rect x="30" y="26" width="8" height="4"  fill="#d4922a" rx="1" />
      <line x1="56" y1="2"  x2="56" y2="8"  stroke="#1D9E75" strokeWidth="1.5" />
      <rect x="52" y="8"  width="8" height="24" fill="#1D9E75" rx="1" />
      <line x1="56" y1="32" x2="56" y2="38" stroke="#1D9E75" strokeWidth="1.5" />
    </svg>
  ),
  'evening star': (
    <svg viewBox="0 0 72 48" width="44" height="30" fill="none">
      <line x1="12" y1="2"  x2="12" y2="8"  stroke="#1D9E75" strokeWidth="1.5" />
      <rect x="8"  y="8"  width="8" height="24" fill="#1D9E75" rx="1" />
      <line x1="12" y1="32" x2="12" y2="38" stroke="#1D9E75" strokeWidth="1.5" />
      <rect x="30" y="14" width="8" height="4"  fill="#d4922a" rx="1" />
      <line x1="56" y1="2"  x2="56" y2="8"  stroke="#e24b4a" strokeWidth="1.5" />
      <rect x="52" y="8"  width="8" height="24" fill="#e24b4a" rx="1" />
      <line x1="56" y1="32" x2="56" y2="38" stroke="#e24b4a" strokeWidth="1.5" />
    </svg>
  ),
}

function getPatternSvg(name = '') {
  const key = name.toLowerCase()
  for (const [fragment, svg] of Object.entries(PATTERN_SVGS)) {
    if (key.includes(fragment)) return svg
  }
  // Generic single candle fallback
  const isBull = key.includes('bull')
  const color  = isBull ? '#1D9E75' : '#e24b4a'
  return (
    <svg viewBox="0 0 20 48" width="14" height="30" fill="none">
      <line x1="10" y1="0"  x2="10" y2="8"  stroke={color} strokeWidth="1.5" />
      <rect x="4"  y="8"  width="12" height="28" fill={color} rx="1" />
      <line x1="10" y1="36" x2="10" y2="48" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

function ReliabilityPip({ pct }) {
  const n = parseInt(pct) || 0
  const color = n >= 70 ? '#1D9E75' : n >= 50 ? '#d4922a' : '#e24b4a'
  return (
    <div className="flex items-center gap-1.5 w-28">
      <span className="text-[10px] text-[#4b6358] shrink-0">Reliability</span>
      <div className="flex-1 h-1 bg-[#1a2e1f] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${n}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] tabular-nums shrink-0" style={{ color }}>{pct}</span>
    </div>
  )
}

function PatternCard({ pattern }) {
  const s = SIGNAL[pattern.signal] ?? SIGNAL.neutral
  return (
    <div className="bg-[#0a0f0d] border border-[#1a2e1f] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="shrink-0">{getPatternSvg(pattern.name)}</div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-sm font-semibold text-[#d1d9d5] leading-tight">{pattern.name}</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider border px-2 py-0.5 rounded-full ${s.badge}`}>
                {pattern.signal}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-[#d1d9d5]/70 leading-relaxed">{pattern.explanation}</p>

      {pattern.traderAction && (
        <p className="text-xs text-[#4b6358] italic leading-relaxed border-l-2 border-[#1a2e1f] pl-2.5">
          {pattern.traderAction}
        </p>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10px] text-[#4b6358]">{pattern.timeframe}</span>
        {pattern.reliability && <ReliabilityPip pct={pattern.reliability} />}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-4">
      <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Candle Patterns</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-[#0a0f0d] border border-[#1a2e1f] rounded-xl p-4 space-y-3">
            <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-2/3" />
            <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-full" />
            <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-4/5" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CandlePatterns({ data, loading }) {
  if (loading) return <Skeleton />
  if (!data?.length) return null

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-4 animate-enter">
      <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Candle Patterns · AI Detected</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.map((p, i) => <PatternCard key={i} pattern={p} />)}
      </div>
    </div>
  )
}
