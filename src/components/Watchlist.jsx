import { useState, useEffect, useRef } from 'react'
import { fetchWatchlistQuotes } from '../services/watchlistQuotes'

function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`
}

function WatchlistTile({ symbol, price, changePct, loading, onSelect, onRemove }) {
  const up    = changePct != null && !isNaN(changePct) && changePct >= 0
  const valid = changePct != null && !isNaN(changePct)
  const pctColor = valid ? (up ? '#1D9E75' : '#e24b4a') : '#4b6358'

  return (
    <div
      className="group relative flex items-center gap-3 bg-[#0f1611] border border-[#1a2e1f] rounded-xl px-4 py-3 hover:border-[#263d2c] hover:bg-[#0c1410] transition-all duration-150 cursor-pointer"
      onClick={() => onSelect(symbol)}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-xs font-bold text-[#d1d9d5] leading-none">{symbol}</span>
        {loading && price == null ? (
          <div className="h-3 w-16 rounded-full shimmer mt-0.5" />
        ) : (
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs tabular-nums text-[#4b6358] leading-none">${fmtPrice(price)}</span>
            <span className="text-[10px] font-bold tabular-nums leading-none" style={{ color: pctColor }}>
              {fmtPct(changePct)}
            </span>
          </div>
        )}
      </div>

      {/* Remove button — revealed on hover */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(symbol) }}
        aria-label={`Remove ${symbol} from watchlist`}
        className="ml-1 shrink-0 text-[#263d2c] hover:text-[#e24b4a] transition-colors duration-150 opacity-0 group-hover:opacity-100"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export default function Watchlist({ tickers, onSelect, onRemove }) {
  const [quotes, setQuotes]   = useState([])
  const [loading, setLoading] = useState(false)
  const tickerKey = tickers.join(',')

  useEffect(() => {
    if (!tickers.length) return
    setLoading(true)
    fetchWatchlistQuotes(tickers)
      .then(setQuotes)
      .catch(() => {})
      .finally(() => setLoading(false))

    const id = setInterval(() => {
      fetchWatchlistQuotes(tickers).then(setQuotes).catch(() => {})
    }, 60_000)

    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey])

  if (!tickers.length) return null

  const items = tickers.map(symbol => {
    const q = quotes.find(x => x.symbol === symbol)
    return { symbol, price: q?.price ?? null, changePct: q?.changePct ?? null }
  })

  return (
    <div className="w-full flex flex-col gap-3 animate-enter">
      <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">My Watchlist</span>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <WatchlistTile
            key={item.symbol}
            {...item}
            loading={loading}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}
