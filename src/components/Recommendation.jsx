import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'

const CONFIG = {
  BUY:  { label: 'BUY',  color: '#1D9E75', bg: 'bg-[#1D9E75]/10', border: 'border-[#1D9E75]/30', bar: '#1D9E75', glow: 'rgba(29,158,117,0.07)' },
  HOLD: { label: 'HOLD', color: '#d4922a', bg: 'bg-[#d4922a]/10',  border: 'border-[#d4922a]/30', bar: '#d4922a', glow: 'rgba(212,146,42,0.07)'  },
  SELL: { label: 'SELL', color: '#e24b4a', bg: 'bg-[#e24b4a]/10',  border: 'border-[#e24b4a]/30', bar: '#e24b4a', glow: 'rgba(226,75,74,0.07)'   },
}

const RISK = {
  LOW:    'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25',
  MEDIUM: 'bg-[#d4922a]/10 text-[#d4922a] border-[#d4922a]/25',
  HIGH:   'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25',
}

function SkeletonLine({ w = 'full' }) {
  return <div className={`h-3 rounded-full shimmer w-${w}`} />
}

function Skeleton() {
  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
        <div className="h-2.5 w-40 rounded-full shimmer" />
      </div>
      <div className="h-16 w-36 rounded-xl shimmer" />
      <div className="flex flex-col gap-2.5">
        <SkeletonLine w="4/5" />
        <SkeletonLine w="3/5" />
        <SkeletonLine w="2/3" />
      </div>
    </div>
  )
}

function Unavailable() {
  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex items-center gap-3">
      <span className="text-[#4b6358] text-lg">—</span>
      <span className="text-sm text-[#4b6358]">AI recommendation unavailable</span>
    </div>
  )
}

export default function Recommendation({ data, loading, asOf }) {
  if (loading) return <Skeleton />
  if (!data?.verdict) return <Unavailable />

  const rec        = data.verdict
  const cfg        = CONFIG[rec] ?? CONFIG.HOLD
  const confidence = typeof data.confidence === 'number' ? Math.min(100, Math.max(0, data.confidence)) : 0
  const riskClass  = RISK[data.riskLevel] ?? RISK.MEDIUM

  return (
    <div className={`relative w-full bg-[#0f1611] border ${cfg.border} rounded-2xl p-6 flex flex-col gap-5 animate-enter overflow-hidden`}>
      {/* Ambient verdict glow */}
      <div
        className="absolute -top-8 -left-8 w-48 h-48 rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: cfg.glow }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em] inline-flex items-center">
          AI Recommendation
          <InfoTooltip>
            Verdict, confidence, entry, and stop derived from a Groq LLaMA-3.3 model conditioned on technical indicators and recent OHLC. Educational only — not financial advice.
          </InfoTooltip>
        </span>
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest ${riskClass}`}>
          {data.riskLevel ?? 'MEDIUM'} Risk
        </span>
      </div>

      {/* Verdict + confidence */}
      <div className="relative flex items-end gap-6 flex-wrap">
        <span className="text-7xl font-black leading-none tracking-tight" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
        <div className="flex flex-col gap-2 mb-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black tabular-nums leading-none" style={{ color: cfg.color }}>{confidence}</span>
            <span className="text-sm text-[#4b6358] font-medium">% confidence</span>
          </div>
          <div className="w-36 h-1 bg-[#1a2e1f] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full animate-bar"
              style={{ width: `${confidence}%`, backgroundColor: cfg.bar, transformOrigin: 'left' }}
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1a2e1f]" />

      {/* Summary */}
      {data.summary && (
        <p className="text-sm text-[#d1d9d5]/80 leading-relaxed">{data.summary}</p>
      )}

      {/* Entry / Stop grid */}
      {(data.entryPrice || data.stopLoss) && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#1a2e1f]">
          {data.entryPrice && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-[#4b6358] uppercase tracking-[0.12em] font-semibold">Entry</p>
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

      {/* Footer — data freshness */}
      {asOf && (
        <div className="relative flex items-center justify-end pt-3 -mb-1 border-t border-[#1a2e1f]/60">
          <DataTimestamp asOf={asOf} source="Groq" />
        </div>
      )}
    </div>
  )
}
