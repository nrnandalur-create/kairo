function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(decimals)
}

function fmtCap(n) {
  if (!n) return '—'
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}T`
  return `$${n.toFixed(1)}B`
}

function Metric({ label, value, sub, highlight }) {
  const color =
    highlight === 'bull' ? 'text-[#1D9E75]' :
    highlight === 'bear' ? 'text-[#e55353]' :
    'text-gray-100'
  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-600">{sub}</span>}
    </div>
  )
}

export default function MetricsBar({ quote, profile, metrics }) {
  if (!quote) return null

  const changeHighlight = quote.dp > 0 ? 'bull' : quote.dp < 0 ? 'bear' : null
  const changeStr = quote.dp != null
    ? `${quote.dp > 0 ? '+' : ''}${fmt(quote.d)} (${quote.dp > 0 ? '+' : ''}${fmt(quote.dp)}%)`
    : '—'

  const hi52 = metrics?.metric?.['52WeekHigh']
  const lo52 = metrics?.metric?.['52WeekLow']
  const rangeStr = hi52 && lo52 ? `$${fmt(lo52)} – $${fmt(hi52)}` : '—'

  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl px-6 py-4 flex flex-wrap gap-6 items-center">
      {/* Big price */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest">Price</span>
        <span className="text-2xl font-bold text-gray-100 tabular-nums">${fmt(quote.c)}</span>
      </div>

      <div className="w-px bg-[#1e2d28] self-stretch" />

      <Metric label="Change" value={changeStr} highlight={changeHighlight} />
      <Metric label="Market Cap" value={fmtCap(profile?.marketCapitalization)} />
      <Metric label="P/E (TTM)" value={fmt(metrics?.metric?.peBasicExclExtraTTM, 1)} />
      <Metric label="Beta" value={fmt(metrics?.metric?.beta)} />
      <Metric label="52W Range" value={rangeStr} />
      <Metric
        label="Day Range"
        value={`$${fmt(quote.l)} – $${fmt(quote.h)}`}
      />
    </div>
  )
}
