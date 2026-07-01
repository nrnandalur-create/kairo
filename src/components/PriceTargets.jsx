function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—'
  return `$${Number(n).toFixed(2)}`
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return null
  return `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`
}

const CONSENSUS = {
  strong_buy:   { label: 'Strong Buy',    color: '#22B585' },
  buy:          { label: 'Buy',           color: '#22B585' },
  hold:         { label: 'Hold',          color: '#e3a234' },
  underperform: { label: 'Underperform',  color: '#ef5454' },
  sell:         { label: 'Sell',          color: '#ef5454' },
}

export default function PriceTargets({ data, currentPrice, loading }) {
  if (!loading && !data) return null

  const low   = data?.targetLow  ?? 0
  const high  = data?.targetHigh ?? 0
  const mean  = data?.targetMean ?? 0
  const range = high - low

  const pct = (val) =>
    range > 0 ? Math.max(3, Math.min(97, ((val - low) / range) * 100)) : 50

  const meanPct    = range > 0 ? pct(mean) : 50
  const currentPct = currentPrice != null && range > 0 ? pct(currentPrice) : null

  const upside = data && currentPrice && currentPrice > 0
    ? ((mean - currentPrice) / currentPrice) * 100
    : null

  const isUpside  = upside != null && upside >= 0
  const consensus = data?.recommendationKey ? (CONSENSUS[data.recommendationKey] ?? null) : null

  // Analyst breakdown bar segments
  const trend       = data?.trend
  const totalTrend  = trend
    ? (trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell)
    : 0
  const bullPct     = totalTrend > 0 ? ((trend.strongBuy + trend.buy)   / totalTrend) * 100 : 0
  const neutralPct  = totalTrend > 0 ? (trend.hold                       / totalTrend) * 100 : 0
  const bearPct     = totalTrend > 0 ? ((trend.sell + trend.strongSell)  / totalTrend) * 100 : 0

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-enter">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Analyst Price Targets</span>
        <div className="flex items-center gap-2">
          {!loading && consensus && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest"
              style={{
                color: consensus.color,
                borderColor: `${consensus.color}40`,
                backgroundColor: `${consensus.color}15`,
              }}
            >
              {consensus.label}
            </span>
          )}
          {!loading && data?.numberOfAnalysts && (
            <span className="text-[9px] text-[var(--c-text-faint)]">{data.numberOfAnalysts} analysts</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <div className="h-7 w-24 rounded-full shimmer" />
            <div className="h-4 w-16 rounded-full shimmer" />
            <div className="h-4 w-14 rounded-full shimmer ml-auto" />
          </div>
          <div className="h-2 rounded-full shimmer" />
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="h-8 rounded-xl shimmer" />
            <div className="h-8 rounded-xl shimmer" />
            <div className="h-8 rounded-xl shimmer" />
          </div>
        </div>
      ) : (
        <>
          {/* Consensus price + upside */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-black tabular-nums text-[var(--c-text)]">{fmtPrice(mean)}</span>
            <span className="text-xs text-[var(--c-text-faint)]">consensus</span>
            {upside != null && (
              <span className={`ml-auto text-sm font-bold tabular-nums shrink-0 ${isUpside ? 'text-[#22B585]' : 'text-[#ef5454]'}`}>
                {fmtPct(upside)}
              </span>
            )}
          </div>

          {/* Visual range bar */}
          {range > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="relative h-1.5 bg-[var(--c-chip-bg)] rounded-full mx-2">
                <div
                  className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-[#22B585] border-[3px] border-[var(--c-card)] shadow"
                  style={{ left: `${meanPct}%`, transform: 'translate(-50%, -50%)' }}
                  title={`Target: ${fmtPrice(mean)}`}
                />
                {currentPct != null && (
                  <div
                    className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-[#d1d9d5] border-[3px] border-[var(--c-card)] shadow"
                    style={{ left: `${currentPct}%`, transform: 'translate(-50%, -50%)' }}
                    title={`Current: ${fmtPrice(currentPrice)}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-[9px] text-[var(--c-text-faint)] px-0.5">
                <span>{fmtPrice(low)}</span>
                <span>{fmtPrice(high)}</span>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-[var(--c-text-faint)]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#d1d9d5] shrink-0" />
                  Current {currentPrice != null ? fmtPrice(currentPrice) : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#22B585] shrink-0" />
                  Target {fmtPrice(mean)}
                </span>
              </div>
            </div>
          )}

          {/* Analyst sentiment breakdown */}
          {totalTrend > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                {bullPct    > 0 && <div className="bg-[#22B585]"    style={{ width: `${bullPct}%`    }} title={`Buy: ${trend.strongBuy + trend.buy}`} />}
                {neutralPct > 0 && <div className="bg-[#e3a234]"    style={{ width: `${neutralPct}%` }} title={`Hold: ${trend.hold}`} />}
                {bearPct    > 0 && <div className="bg-[#ef5454]"    style={{ width: `${bearPct}%`    }} title={`Sell: ${trend.sell + trend.strongSell}`} />}
              </div>
              <div className="flex items-center gap-3 text-[9px] text-[var(--c-text-faint)]">
                {bullPct > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22B585] shrink-0" />
                    Buy {trend.strongBuy + trend.buy}
                  </span>
                )}
                {neutralPct > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e3a234] shrink-0" />
                    Hold {trend.hold}
                  </span>
                )}
                {bearPct > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ef5454] shrink-0" />
                    Sell {trend.sell + trend.strongSell}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[var(--c-border)]">
            {[
              { label: 'Low Target',  value: fmtPrice(data.targetLow)  },
              { label: 'Mean Target', value: fmtPrice(data.targetMean) },
              { label: 'High Target', value: fmtPrice(data.targetHigh) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-widest mb-1">{label}</p>
                <p className="text-xs font-bold tabular-nums text-[var(--c-text)]">{value}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
