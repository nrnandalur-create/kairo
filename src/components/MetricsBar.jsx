function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(dec)
}
function fmtCap(n) {
  // Finnhub returns marketCapitalization in millions USD
  if (!n) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}
function fmtVol(n) {
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toFixed(0)
}

function MetricCell({ label, value, color }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color || 'text-[#d1d9d5]'}`}>{value}</span>
    </div>
  )
}

export default function MetricsBar({ quote, profile, metrics }) {
  if (!quote) return null

  const up   = quote.dp > 0
  const down = quote.dp < 0
  const chgColor = up ? 'text-[#1D9E75]' : down ? 'text-[#e24b4a]' : 'text-[#4b6358]'
  const arrow    = up ? '▲' : down ? '▼' : '◆'
  const chgStr   = quote.d != null
    ? `${up ? '+' : ''}${fmt(quote.d)} (${up ? '+' : ''}${fmt(quote.dp)}%)`
    : '—'

  const hi52 = metrics?.metric?.['52WeekHigh']
  const lo52 = metrics?.metric?.['52WeekLow']

  // Finnhub may populate any of these P/E fields depending on the ticker's earnings state
  const pe = metrics?.metric?.peBasicExclExtraTTM
          ?? metrics?.metric?.peTTM
          ?? metrics?.metric?.peExclExtraTTM
          ?? metrics?.metric?.peNormalizedAnnual

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-5 sm:p-6 animate-enter flex flex-col gap-4">
      {/* Company + price row */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
        <div className="flex flex-col gap-0.5">
          {profile?.name && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#d1d9d5]">{profile.name}</span>
              {profile.exchange && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#1a2e1f] text-[#4b6358] uppercase tracking-widest border border-[#263d2c]">
                  {profile.exchange}
                </span>
              )}
            </div>
          )}
          <div className="flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-black text-white tabular-nums tracking-tight">
              ${fmt(quote.c)}
            </span>
            <span className={`text-base font-bold tabular-nums ${chgColor}`}>
              {arrow} {chgStr}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1a2e1f]" />

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCell label="Market Cap"  value={fmtCap(profile?.marketCapitalization)} />
        <MetricCell label="P/E (TTM)"   value={fmt(pe, 1)} />
        <MetricCell label="Beta"        value={fmt(metrics?.metric?.beta)} />
        <MetricCell label="52W Range"   value={hi52 && lo52 ? `$${fmt(lo52)} – $${fmt(hi52)}` : '—'} />
        <MetricCell label="Day Range"   value={`$${fmt(quote.l)} – $${fmt(quote.h)}`} />
        <MetricCell label="Prev Close"  value={`$${fmt(quote.pc)}`} />
      </div>
    </div>
  )
}
