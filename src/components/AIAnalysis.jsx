function ScoreBar({ score }) {
  const pct = (score / 10) * 100
  const color = score >= 6.5 ? '#1D9E75' : score >= 4.5 ? '#f59e0b' : '#e55353'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-[#1a2820] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{score}/10</span>
    </div>
  )
}

export default function AIAnalysis({ data, loading }) {
  if (loading) {
    return (
      <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#1D9E75] animate-pulse" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Claude is analyzing…</span>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-[#1a2820] rounded animate-pulse w-3/4" />
          <div className="h-3 bg-[#1a2820] rounded animate-pulse w-full" />
          <div className="h-3 bg-[#1a2820] rounded animate-pulse w-5/6" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const isBull = data.verdict === 'bullish'
  const isNeutral = data.verdict === 'neutral'
  const verdictColor = isBull ? 'text-[#1D9E75]' : isNeutral ? 'text-yellow-400' : 'text-[#e55353]'
  const verdictBg = isBull
    ? 'bg-[#1D9E75]/10 border-[#1D9E75]/25'
    : isNeutral
    ? 'bg-yellow-500/10 border-yellow-500/25'
    : 'bg-[#e55353]/10 border-[#e55353]/25'
  const verdictLabel = isBull ? '▲ Bullish' : isNeutral ? '◆ Neutral' : '▼ Bearish'

  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Analysis · Claude</span>
        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border ${verdictBg} ${verdictColor}`}>
          {verdictLabel}
        </span>
      </div>

      <ScoreBar score={data.score} />

      <p className="text-sm text-gray-300 leading-relaxed">{data.summary}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-[#1D9E75]/8 border border-[#1D9E75]/20 rounded-xl p-3">
          <p className="text-[10px] text-[#1D9E75] font-bold uppercase tracking-widest mb-1.5">Bull Case</p>
          <p className="text-xs text-gray-400 leading-relaxed">{data.bullCase}</p>
        </div>
        <div className="bg-[#e55353]/8 border border-[#e55353]/20 rounded-xl p-3">
          <p className="text-[10px] text-[#e55353] font-bold uppercase tracking-widest mb-1.5">Bear Case</p>
          <p className="text-xs text-gray-400 leading-relaxed">{data.bearCase}</p>
        </div>
      </div>

      {data.tradeIdea && (
        <div className="bg-[#1a2820] border border-[#1D9E75]/15 rounded-xl p-3">
          <p className="text-[10px] text-[#1D9E75] font-bold uppercase tracking-widest mb-1.5">Trade Idea</p>
          <p className="text-xs text-gray-300 leading-relaxed">{data.tradeIdea}</p>
        </div>
      )}
    </div>
  )
}
