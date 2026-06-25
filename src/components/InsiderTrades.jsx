function fmtShares(n) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${Math.round(abs / 1_000)}K`
  return abs.toLocaleString()
}

function fmtValue(change, price) {
  if (!change || !price) return null
  const val = Math.abs(change) * price
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(1)}B`
  if (val >= 1_000_000)     return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000)         return `$${Math.round(val / 1_000)}K`
  return `$${Math.round(val)}`
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function titleCase(str) {
  if (!str) return '—'
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0">
      <div className="h-3 flex-1 rounded-full shimmer" />
      <div className="h-5 w-10 rounded-full shimmer shrink-0" />
      <div className="h-3 w-10 rounded-full shimmer shrink-0" />
      <div className="h-3 w-12 rounded-full shimmer shrink-0 hidden sm:block" />
      <div className="h-3 w-12 rounded-full shimmer shrink-0" />
    </div>
  )
}

export default function InsiderTrades({ data, loading }) {
  if (!loading && (!data || data.length === 0)) return null

  const rows = data?.slice(0, 5) ?? []

  return (
    <div className="w-full glass-card rounded-2xl p-5 flex flex-col gap-4 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Insider Transactions</span>

      {loading ? (
        <div className="flex flex-col">
          {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Column headers */}
          <div className="flex items-center gap-3 pb-2 mb-0.5 border-b border-[var(--c-border)]">
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest flex-1">Insider</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-10 text-center shrink-0">Type</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-12 text-right shrink-0">Shares</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-14 text-right shrink-0 hidden sm:block">Value</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-14 text-right shrink-0">Date</span>
          </div>

          {rows.map((t, i) => {
            const isBuy  = t.transactionCode === 'P'
            const value  = fmtValue(t.change, t.transactionPrice)
            const date   = t.transactionDate || t.filingDate
            return (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0">
                <span className="text-xs text-[var(--c-text)] flex-1 min-w-0 truncate">{titleCase(t.name)}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-widest shrink-0 w-10 text-center ${
                  isBuy
                    ? 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25'
                    : 'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25'
                }`}>
                  {isBuy ? 'Buy' : 'Sell'}
                </span>
                <span className="text-xs tabular-nums text-[var(--c-text)] w-12 text-right shrink-0">
                  {fmtShares(t.change)}
                </span>
                <span className="text-xs tabular-nums text-[var(--c-text-faint)] w-14 text-right shrink-0 hidden sm:block">
                  {value ?? '—'}
                </span>
                <span className="text-xs tabular-nums text-[var(--c-text-faint)] w-14 text-right shrink-0">
                  {fmtDate(date)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
