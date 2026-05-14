const SIGNAL = {
  bullish: { dot: 'bg-[#1D9E75]', badge: 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25' },
  bearish: { dot: 'bg-[#e55353]',  badge: 'bg-[#e55353]/10  text-[#e55353]  border-[#e55353]/25'  },
  neutral: { dot: 'bg-yellow-400', badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' },
}

function ReliabilityPip({ pct }) {
  const n = parseInt(pct) || 0
  const color = n >= 70 ? '#1D9E75' : n >= 50 ? '#f59e0b' : '#e55353'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-[#1a2820] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${n}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] tabular-nums" style={{ color }}>{pct}</span>
    </div>
  )
}

function PatternCard({ pattern }) {
  const s = SIGNAL[pattern.signal] ?? SIGNAL.neutral
  return (
    <div className="bg-[#111a17] border border-[#1e2d28] rounded-xl p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
          <span className="text-sm font-semibold text-gray-100">{pattern.name}</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${s.badge}`}>
          {pattern.signal}
        </span>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">{pattern.explanation}</p>

      {pattern.traderAction && (
        <p className="text-xs text-gray-500 italic leading-relaxed border-l-2 border-[#1e2d28] pl-2">
          {pattern.traderAction}
        </p>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[10px] text-gray-600">{pattern.timeframe}</span>
        {pattern.reliability && (
          <div className="flex items-center gap-1.5 w-28">
            <span className="text-[10px] text-gray-600 shrink-0">Reliability</span>
            <ReliabilityPip pct={pattern.reliability} />
          </div>
        )}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl p-6 flex flex-col gap-4">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Candle Patterns</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-[#111a17] border border-[#1e2d28] rounded-xl p-4 space-y-2.5">
            <div className="h-3 bg-[#1a2820] rounded animate-pulse w-2/3" />
            <div className="h-3 bg-[#1a2820] rounded animate-pulse w-full" />
            <div className="h-3 bg-[#1a2820] rounded animate-pulse w-4/5" />
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
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl p-6 flex flex-col gap-4">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Candle Patterns · AI Detected</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.map((p, i) => <PatternCard key={i} pattern={p} />)}
      </div>
    </div>
  )
}
