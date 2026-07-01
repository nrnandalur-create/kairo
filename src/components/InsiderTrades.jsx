function fmtShares(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${Math.round(abs / 1_000)}K`
  return abs.toLocaleString()
}

function fmtValue(v) {
  if (!v || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `$${Math.round(abs / 1_000)}K`
  return `$${Math.round(abs)}`
}

function fmtSignedValue(v) {
  if (!Number.isFinite(v) || v === 0) return '$0'
  const sign = v > 0 ? '+' : '−'
  return `${sign}${fmtValue(v).replace('$', '$')}`
}

function fmtPrice(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${Number(n).toFixed(2)}`
}

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return '—'
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function titleCase(str) {
  if (!str) return '—'
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// Column template used by BOTH the header and every row so alignment
// stays pixel-perfect on narrow screens (mobile scrolls this row group
// horizontally as one block).
const ROW_TEMPLATE = 'grid-cols-[minmax(160px,2fr)_64px_72px_72px_84px_64px]'

function SkeletonRow() {
  return (
    <div className={`grid ${ROW_TEMPLATE} items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0`}>
      <div className="h-3 w-full rounded-full shimmer" />
      <div className="h-5 w-10 rounded-full shimmer" />
      <div className="h-3 w-12 rounded-full shimmer" />
      <div className="h-3 w-12 rounded-full shimmer" />
      <div className="h-3 w-14 rounded-full shimmer" />
      <div className="h-3 w-10 rounded-full shimmer" />
    </div>
  )
}

function SentimentPill({ sentiment }) {
  if (!sentiment || sentiment.totalTransactions === 0) return null

  const isBuyer  = sentiment.netBias === 'buyer'
  const isSeller = sentiment.netBias === 'seller'
  const color    = isBuyer ? '#22B585' : isSeller ? '#ef5454' : '#e3a234'
  const label    = isBuyer ? 'Net Buyer' : isSeller ? 'Net Seller' : 'Balanced'
  const signed   = fmtSignedValue(sentiment.netValue)

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-xl border"
      style={{ borderColor: `${color}33`, backgroundColor: `${color}0f` }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color }}>
            {label}
          </span>
          <span className="text-[10px] text-[var(--c-text-faint)]">last {sentiment.windowDays}d</span>
        </div>
        <span className="text-base font-black tabular-nums" style={{ color }}>
          {signed}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-[var(--c-text-faint)] tabular-nums">
        <span>
          <span className="text-[#22B585]">▲</span> {sentiment.buyerCount} buy · {fmtValue(sentiment.buyValue)}
        </span>
        <span className="text-[var(--c-text-fainter)]">·</span>
        <span>
          <span className="text-[#ef5454]">▼</span> {sentiment.sellerCount} sell · {fmtValue(sentiment.sellValue)}
        </span>
      </div>
    </div>
  )
}

function EmptyState({ ticker }) {
  return (
    <div className="border border-[var(--c-border)] bg-[var(--c-input-bg)] rounded-xl p-6 flex flex-col items-center gap-2 text-center">
      <span className="text-[var(--c-text-fainter)] text-lg leading-none">◇</span>
      <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
        No insider transactions
      </span>
      <p className="text-[11px] text-[var(--c-text-fainter)] max-w-[280px] leading-relaxed">
        No SEC Form 4 filings reported for {ticker ?? 'this ticker'} in the last quarter.
        ETFs, index funds, and some ADRs don't have reporting insiders.
      </p>
    </div>
  )
}

export default function InsiderTrades({ data, loading, ticker }) {
  // Accept both the new shape ({ transactions, sentiment }) and the old
  // legacy array shape so cached responses from the SWR window don't crash.
  const transactions = Array.isArray(data) ? data : data?.transactions ?? []
  const sentiment    = Array.isArray(data) ? null : data?.sentiment

  return (
    <div className="w-full glass-card rounded-2xl p-4 sm:p-5 flex flex-col gap-4 animate-enter">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">
          Insider Transactions
          {ticker && <span className="text-[var(--c-text-fainter)] font-normal ml-1.5">· {ticker}</span>}
        </span>
        {transactions.length > 0 && (
          <span className="text-[10px] text-[var(--c-text-faint)]">
            Showing top {Math.min(transactions.length, 10)} of {transactions.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col">
          {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState ticker={ticker} />
      ) : (
        <>
          {sentiment && <SentimentPill sentiment={sentiment} />}

          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <div className="min-w-[480px]">
              {/* Column headers — Title omitted because Finnhub's insider-
                  transactions endpoint doesn't include role/position for
                  most tickers. Better to widen the Name column than to
                  render a column of dashes. */}
              <div className={`grid ${ROW_TEMPLATE} items-center gap-3 pb-2 mb-0.5 border-b border-[var(--c-border)]`}>
                <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Insider</span>
                <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest text-center">Type</span>
                <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest text-right">Shares</span>
                <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest text-right">Price</span>
                <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest text-right">Value</span>
                <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest text-right">Date</span>
              </div>

              {transactions.slice(0, 10).map((t, i) => {
                const isBuy = t.transactionType === 'Buy' || t.transactionCode === 'P'
                return (
                  <div
                    key={i}
                    className={`grid ${ROW_TEMPLATE} items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0`}
                  >
                    <span className="text-xs text-[var(--c-text)] truncate" title={titleCase(t.name)}>
                      {titleCase(t.name)}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-widest text-center ${
                      isBuy
                        ? 'bg-[#22B585]/10 text-[#22B585] border-[#22B585]/25'
                        : 'bg-[#ef5454]/10 text-[#ef5454] border-[#ef5454]/25'
                    }`}>
                      {isBuy ? 'Buy' : 'Sell'}
                    </span>
                    <span className="text-xs tabular-nums text-[var(--c-text)] text-right">
                      {fmtShares(t.shares ?? Math.abs(t.change))}
                    </span>
                    <span className="text-xs tabular-nums text-[var(--c-text-faint)] text-right">
                      {fmtPrice(t.transactionPrice)}
                    </span>
                    <span className="text-xs tabular-nums font-semibold text-[var(--c-text)] text-right">
                      {fmtValue(t.value ?? (Math.abs(t.change) * t.transactionPrice))}
                    </span>
                    <span className="text-xs tabular-nums text-[var(--c-text-faint)] text-right">
                      {fmtDate(t.transactionDate ?? t.filingDate)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
