const CONFIG = {
  BUY:  { label: 'BUY',  color: '#1D9E75', bg: 'bg-[#1D9E75]/10', border: 'border-[#1D9E75]/25', bar: 'bg-[#1D9E75]' },
  HOLD: { label: 'HOLD', color: '#f59e0b', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25', bar: 'bg-yellow-400' },
  SELL: { label: 'SELL', color: '#e55353', bg: 'bg-[#e55353]/10',  border: 'border-[#e55353]/25',  bar: 'bg-[#e55353]' },
}

const RISK = {
  Low:    'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25',
  Medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25',
  High:   'bg-[#e55353]/10 text-[#e55353] border-[#e55353]/25',
}

function Skeleton() {
  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#1D9E75] animate-pulse" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Generating recommendation…</span>
      </div>
      <div className="flex items-end gap-4">
        <div className="h-14 w-32 bg-[#1a2820] rounded-xl animate-pulse" />
        <div className="h-5 w-24 bg-[#1a2820] rounded animate-pulse mb-1" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-3 bg-[#1a2820] rounded animate-pulse" style={{ width: `${70 + i * 8}%` }} />)}
      </div>
    </div>
  )
}

export default function Recommendation({ data, loading }) {
  if (loading) return <Skeleton />
  if (!data?.recommendation) return null

  const rec = data.recommendation.toUpperCase()
  const cfg = CONFIG[rec] ?? CONFIG.HOLD
  const confidence = typeof data.confidence === 'number' ? data.confidence : 0
  const reasons = Array.isArray(data.reasons) ? data.reasons : []
  const riskClass = RISK[data.riskLevel] ?? RISK.Medium

  return (
    <div className={`w-full bg-[#0d1210] border ${cfg.border} rounded-2xl p-6 flex flex-col gap-5`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Recommendation · Gemini</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest ${riskClass}`}>
          {data.riskLevel ?? 'Medium'} Risk
        </span>
      </div>

      {/* Verdict + confidence */}
      <div className="flex items-end gap-5 flex-wrap">
        <span className="text-6xl font-black leading-none" style={{ color: cfg.color }}>{cfg.label}</span>
        <div className="flex flex-col gap-1.5 mb-1">
          <span className="text-xs text-gray-500">{confidence}% confident</span>
          <div className="w-32 h-1.5 bg-[#1a2820] rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${confidence}%` }} />
          </div>
        </div>
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <ul className="flex flex-col gap-2">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
              <span style={{ color: cfg.color }} className="shrink-0 mt-0.5 font-bold">›</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Entry / Stop */}
      {(data.entryPrice || data.stopLoss) && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#1e2d28]">
          {data.entryPrice && (
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-0.5">Suggested Entry</p>
              <p className="text-sm font-semibold text-gray-100">${Number(data.entryPrice).toFixed(2)}</p>
            </div>
          )}
          {data.stopLoss && (
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-0.5">Stop Loss</p>
              <p className="text-sm font-semibold text-[#e55353]">${Number(data.stopLoss).toFixed(2)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
