const SIGNAL_COLORS = {
  bullish: { badge: 'bg-[#1D9E75]/15 text-[#1D9E75] border-[#1D9E75]/30', dot: 'bg-[#1D9E75]' },
  bearish: { badge: 'bg-[#e55353]/15 text-[#e55353] border-[#e55353]/30', dot: 'bg-[#e55353]' },
  neutral: { badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400' },
}

function PatternCard({ pattern }) {
  const colors = SIGNAL_COLORS[pattern.signal] ?? SIGNAL_COLORS.neutral

  return (
    <div className="bg-[#242736] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
          <span className="text-sm font-semibold text-gray-100">{pattern.name}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors.badge}`}>
          {pattern.signal}
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{pattern.explanation}</p>
      <span className="text-xs text-gray-500">{pattern.timeframe}</span>
    </div>
  )
}

export default function CandlePatterns({ data }) {
  if (!data?.length) return null

  return (
    <div className="w-full bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Candle Patterns</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.map((p, i) => (
          <PatternCard key={i} pattern={p} />
        ))}
      </div>
    </div>
  )
}
