function ScoreRing({ score }) {
  const s = typeof score === 'number' && !isNaN(score) ? score : 0
  const color = s >= 6.5 ? '#1D9E75' : s >= 4.5 ? '#d4922a' : '#e24b4a'
  const pct = (s / 10) * 100
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-14 h-14 shrink-0">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="22" fill="none" stroke="#1a2e1f" strokeWidth="5" />
          <circle
            cx="28" cy="28" r="22" fill="none"
            stroke={color} strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 22}`}
            strokeDashoffset={`${2 * Math.PI * 22 * (1 - pct / 100)}`}
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums" style={{ color }}>
          {s.toFixed(1)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-[#4b6358] uppercase tracking-[0.12em] font-semibold">AI Score</span>
        <span className="text-xs text-[#d1d9d5]">out of 10</span>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#1D9E75] animate-pulse" />
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Gemini is analyzing…</span>
      </div>
      <div className="flex gap-4 items-center">
        <div className="w-14 h-14 rounded-full bg-[#1a2e1f] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-3/4" />
          <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-full" />
        <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-5/6" />
        <div className="h-3 bg-[#1a2e1f] rounded animate-pulse w-4/6" />
      </div>
    </div>
  )
}

export default function AIAnalysis({ data, loading }) {
  if (loading) return <Skeleton />
  if (!data) return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex items-center gap-3">
      <span className="text-[#4b6358] text-lg">—</span>
      <span className="text-sm text-[#4b6358]">AI analysis unavailable · check Vercel logs for details</span>
    </div>
  )

  const isBull    = data.verdict === 'bullish'
  const isNeutral = data.verdict === 'neutral'
  const verdictColor  = isBull ? '#1D9E75' : isNeutral ? '#d4922a' : '#e24b4a'
  const verdictLabel  = isBull ? '▲ Bullish' : isNeutral ? '◆ Neutral' : '▼ Bearish'
  const verdictBorder = isBull ? 'border-[#1D9E75]/25 text-[#1D9E75] bg-[#1D9E75]/10'
                      : isNeutral ? 'border-[#d4922a]/25 text-[#d4922a] bg-[#d4922a]/10'
                      : 'border-[#e24b4a]/25 text-[#e24b4a] bg-[#e24b4a]/10'

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-5 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">AI Analysis · Gemini</span>
        <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${verdictBorder}`}>
          {verdictLabel}
        </span>
      </div>

      {/* Score ring + summary */}
      <div className="flex items-start gap-4">
        <ScoreRing score={data.score} />
        <p className="text-sm text-[#d1d9d5] leading-relaxed flex-1">{data.summary}</p>
      </div>

      {/* Bull / Bear split bar */}
      {(data.bullCase || data.bearCase) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[#1D9E75]/8 border border-[#1D9E75]/20 rounded-xl p-3.5">
            <p className="text-[10px] text-[#1D9E75] font-bold uppercase tracking-widest mb-2">Bull Case</p>
            <p className="text-xs text-[#d1d9d5]/70 leading-relaxed">{data.bullCase}</p>
          </div>
          <div className="bg-[#e24b4a]/8 border border-[#e24b4a]/20 rounded-xl p-3.5">
            <p className="text-[10px] text-[#e24b4a] font-bold uppercase tracking-widest mb-2">Bear Case</p>
            <p className="text-xs text-[#d1d9d5]/70 leading-relaxed">{data.bearCase}</p>
          </div>
        </div>
      )}

      {/* Trade idea */}
      {data.tradeIdea && (
        <div className="border-l-2 border-[#1D9E75]/50 pl-4 py-1">
          <p className="text-[10px] text-[#1D9E75] font-bold uppercase tracking-widest mb-1.5">Trade Idea</p>
          <p className="text-sm text-[#d1d9d5] leading-relaxed">{data.tradeIdea}</p>
        </div>
      )}
    </div>
  )
}
