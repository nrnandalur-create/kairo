const CONFIG = {
  BUY:  { label: 'BUY',  color: '#1D9E75', bg: 'bg-[#1D9E75]/10', border: 'border-[#1D9E75]/25', bar: '#1D9E75' },
  HOLD: { label: 'HOLD', color: '#d4922a', bg: 'bg-[#d4922a]/10',  border: 'border-[#d4922a]/25', bar: '#d4922a' },
  SELL: { label: 'SELL', color: '#e24b4a', bg: 'bg-[#e24b4a]/10',  border: 'border-[#e24b4a]/25', bar: '#e24b4a' },
}

const RISK = {
  Low:    'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25',
  Medium: 'bg-[#d4922a]/10 text-[#d4922a] border-[#d4922a]/25',
  High:   'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25',
}

function Skeleton() {
  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#1D9E75] animate-pulse" />
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Generating recommendation…</span>
      </div>
      <div className="h-16 w-40 bg-[#1a2e1f] rounded-xl animate-pulse" />
      <div className="space-y-2.5">
        {[80, 65, 72].map((w, i) => (
          <div key={i} className="h-3 bg-[#1a2e1f] rounded animate-pulse" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

export default function Recommendation({ data, loading }) {
  if (loading) return <Skeleton />
  if (!data?.recommendation) return null

  const rec = data.recommendation.toUpperCase()
  const cfg = CONFIG[rec] ?? CONFIG.HOLD
  const confidence = typeof data.confidence === 'number' ? Math.min(100, Math.max(0, data.confidence)) : 0
  const reasons = Array.isArray(data.reasons) ? data.reasons.slice(0, 3) : []
  const riskClass = RISK[data.riskLevel] ?? RISK.Medium

  return (
    <div className={`w-full bg-[#0f1611] border ${cfg.border} rounded-2xl p-6 flex flex-col gap-5 animate-enter`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">AI Recommendation · Gemini</span>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest ${riskClass}`}>
          {data.riskLevel ?? 'Medium'} Risk
        </span>
      </div>

      {/* Verdict + confidence */}
      <div className="flex items-end gap-6 flex-wrap">
        <span className="text-7xl font-black leading-none tracking-tight" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
        <div className="flex flex-col gap-2 mb-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black tabular-nums leading-none" style={{ color: cfg.color }}>{confidence}</span>
            <span className="text-sm text-[#4b6358] font-medium">% confidence</span>
          </div>
          <div className="w-36 h-1.5 bg-[#1a2e1f] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full animate-bar"
              style={{ width: `${confidence}%`, backgroundColor: cfg.bar, transformOrigin: 'left' }}
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1a2e1f]" />

      {/* Reasons */}
      {reasons.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-[#d1d9d5]">
              <span className="shrink-0 mt-0.5 font-bold text-xs" style={{ color: cfg.color }}>›</span>
              <span className="leading-relaxed">{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Entry / Stop grid */}
      {(data.entryPrice || data.stopLoss) && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#1a2e1f]">
          {data.entryPrice && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-[#4b6358] uppercase tracking-[0.12em] font-semibold">Suggested Entry</p>
              <p className="text-base font-bold text-[#d1d9d5] tabular-nums">${Number(data.entryPrice).toFixed(2)}</p>
            </div>
          )}
          {data.stopLoss && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-[#4b6358] uppercase tracking-[0.12em] font-semibold">Stop Loss</p>
              <p className="text-base font-bold tabular-nums" style={{ color: '#e24b4a' }}>${Number(data.stopLoss).toFixed(2)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
