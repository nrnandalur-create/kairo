function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—'
  return `$${Number(n).toFixed(2)}`
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return null
  return `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`
}

export default function PriceTargets({ data, currentPrice, loading }) {
  const low    = data?.targetLow    ?? 0
  const high   = data?.targetHigh   ?? 0
  const mean   = data?.targetMean   ?? 0
  const range  = high - low

  const pct = (val) =>
    range > 0 ? Math.max(3, Math.min(97, ((val - low) / range) * 100)) : 50

  const meanPct    = range > 0 ? pct(mean) : 50
  const currentPct = currentPrice != null && range > 0 ? pct(currentPrice) : null

  const upside = data && currentPrice && currentPrice > 0
    ? ((mean - currentPrice) / currentPrice) * 100
    : null

  const isUpside = upside != null && upside >= 0

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-5 flex flex-col gap-4 animate-enter">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Analyst Price Targets</span>
        {!loading && data?.numberOfAnalysts && (
          <span className="text-[9px] text-[#4b6358]">{data.numberOfAnalysts} analysts</span>
        )}
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
      ) : !data ? (
        <div className="border border-dashed border-[#1a2e1f] rounded-xl px-4 py-6 text-center">
          <p className="text-xs text-[#4b6358]">No analyst targets on record for this ticker</p>
        </div>
      ) : (
        <>
          {/* Consensus + upside */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-black tabular-nums text-[#d1d9d5]">{fmtPrice(mean)}</span>
            <span className="text-xs text-[#4b6358]">consensus</span>
            {upside != null && (
              <span className={`ml-auto text-sm font-bold tabular-nums shrink-0 ${isUpside ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}`}>
                {fmtPct(upside)}
              </span>
            )}
          </div>

          {/* Visual range bar */}
          {range > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="relative h-1.5 bg-[#1a2e1f] rounded-full mx-2">
                {/* Mean target dot */}
                <div
                  className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-[#1D9E75] border-[3px] border-[#0f1611] shadow"
                  style={{ left: `${meanPct}%`, transform: 'translate(-50%, -50%)' }}
                  title={`Target: ${fmtPrice(mean)}`}
                />
                {/* Current price dot */}
                {currentPct != null && (
                  <div
                    className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-[#d1d9d5] border-[3px] border-[#0f1611] shadow"
                    style={{ left: `${currentPct}%`, transform: 'translate(-50%, -50%)' }}
                    title={`Current: ${fmtPrice(currentPrice)}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-[9px] text-[#4b6358] px-0.5">
                <span>{fmtPrice(low)}</span>
                <span>{fmtPrice(high)}</span>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-[#4b6358]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#d1d9d5] shrink-0" />
                  Current {currentPrice != null ? fmtPrice(currentPrice) : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#1D9E75] shrink-0" />
                  Target {fmtPrice(mean)}
                </span>
              </div>
            </div>
          )}

          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#1a2e1f]">
            {[
              { label: 'Low Target',  value: fmtPrice(data?.targetLow)  },
              { label: 'Mean Target', value: fmtPrice(data?.targetMean) },
              { label: 'High Target', value: fmtPrice(data?.targetHigh) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[9px] text-[#4b6358] uppercase tracking-widest mb-1">{label}</p>
                <p className="text-xs font-bold tabular-nums text-[#d1d9d5]">{value}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
