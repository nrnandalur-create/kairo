import { calcSR } from '../utils/indicators'

function fmt(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

function pctAway(level, price) {
  return (((level - price) / price) * 100).toFixed(1)
}

function LevelRow({ price, level, isResistance }) {
  const pct      = pctAway(level, price)
  const distance = Math.abs((level - price) / price)
  const barWidth = Math.min(100, distance * 500) // scale: 20% gap = full bar
  const color    = isResistance ? '#e24b4a' : '#1D9E75'
  const labelColor = isResistance ? 'text-[#e24b4a]' : 'text-[#1D9E75]'

  return (
    <div className="flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg hover:bg-[#0c1410] transition-colors duration-150">
      <span className={`text-xs font-semibold tabular-nums w-16 shrink-0 text-right ${labelColor}`}>
        ${fmt(level)}
      </span>
      <div className="flex-1 h-1 bg-[#1a2e1f] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${barWidth}%`,
            backgroundColor: color,
            marginLeft: isResistance ? 0 : 'auto',
          }}
        />
      </div>
      <span className="text-[11px] text-[#4b6358] tabular-nums w-12 shrink-0">
        {isResistance ? '+' : ''}{pct}%
      </span>
    </div>
  )
}

export default function SupportResistance({ candles, currentPrice }) {
  if (!candles?.length || !currentPrice) return null

  const { resistance, support } = calcSR(candles, currentPrice)

  if (!resistance.length && !support.length) return null

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-5 animate-enter">
      <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Support &amp; Resistance</span>

      <div className="flex flex-col gap-1">
        {/* Resistance levels — nearest first (lowest resistance above price) */}
        {[...resistance].sort((a, b) => a - b).map((lvl, i) => (
          <LevelRow key={`r-${i}`} price={currentPrice} level={lvl} isResistance />
        ))}

        {/* Current price marker */}
        <div className="flex items-center gap-3 py-2 px-2 -mx-2">
          <span className="text-xs font-black tabular-nums w-16 shrink-0 text-right text-[#d1d9d5]">
            ${fmt(currentPrice)}
          </span>
          <div className="flex-1 flex items-center gap-1.5">
            <div className="flex-1 h-px bg-[#263d2c]" />
            <span className="text-[9px] font-bold text-[#1D9E75]/70 uppercase tracking-widest px-2 py-0.5 border border-[#1D9E75]/20 rounded-full bg-[#1D9E75]/5">Now</span>
            <div className="flex-1 h-px bg-[#263d2c]" />
          </div>
          <span className="text-[11px] text-[#4b6358] w-12 shrink-0" />
        </div>

        {/* Support levels — nearest first (highest support below price) */}
        {[...support].sort((a, b) => b - a).map((lvl, i) => (
          <LevelRow key={`s-${i}`} price={currentPrice} level={lvl} isResistance={false} />
        ))}
      </div>

      <p className="text-[10px] text-[#4b6358] leading-relaxed">
        Levels derived from pivot highs/lows in the chart window. Use as zones, not exact prices.
      </p>
    </div>
  )
}
