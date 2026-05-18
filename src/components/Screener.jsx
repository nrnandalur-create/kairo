import { useState, useEffect } from 'react'

const FILTERS = [
  {
    key: 'cap', label: 'Market Cap',
    opts: [
      { value: 'all',   label: 'All'   },
      { value: 'large', label: 'Large' },
      { value: 'mid',   label: 'Mid'   },
    ],
  },
  {
    key: 'rsi', label: 'RSI Signal',
    opts: [
      { value: 'all',        label: 'All'         },
      { value: 'oversold',   label: 'Oversold <35' },
      { value: 'neutral',    label: 'Neutral'      },
      { value: 'overbought', label: 'Overbought >65'},
    ],
  },
  {
    key: 'bb', label: 'Bollinger Bands',
    opts: [
      { value: 'all',    label: 'All'         },
      { value: 'lower',  label: 'Near Lower'  },
      { value: 'middle', label: 'Middle Band' },
      { value: 'upper',  label: 'Near Upper'  },
    ],
  },
  {
    key: 'direction', label: 'Today',
    opts: [
      { value: 'all',  label: 'All'  },
      { value: 'up',   label: 'Up'   },
      { value: 'down', label: 'Down' },
    ],
  },
]

const INIT_FILTERS = { cap: 'all', rsi: 'all', bb: 'all', direction: 'all' }

function matches(stock, f) {
  if (f.cap !== 'all' && stock.cap !== f.cap) return false
  if (f.rsi !== 'all') {
    if (stock.rsi == null) return false
    if (f.rsi === 'oversold'   && stock.rsi >= 35) return false
    if (f.rsi === 'overbought' && stock.rsi <= 65) return false
    if (f.rsi === 'neutral'    && (stock.rsi < 35 || stock.rsi > 65)) return false
  }
  if (f.bb !== 'all') {
    if (stock.bbPct == null) return false
    if (f.bb === 'lower'  && stock.bbPct >= 25) return false
    if (f.bb === 'upper'  && stock.bbPct <= 75) return false
    if (f.bb === 'middle' && (stock.bbPct < 25 || stock.bbPct > 75)) return false
  }
  if (f.direction === 'up'   && (stock.changePct ?? 0) <= 0) return false
  if (f.direction === 'down' && (stock.changePct ?? 0) >= 0) return false
  return true
}

function FilterChips({ def, value, onChange }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-[#4b6358] uppercase tracking-widest mb-2">{def.label}</p>
      <div className="flex flex-wrap gap-1.5">
        {def.opts.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
              value === opt.value
                ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                : 'bg-[#0a0f0d] text-[#4b6358] border-[#1a2e1f] hover:border-[#263d2c] hover:text-[#d1d9d5]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function StockCard({ stock, onSelect }) {
  const up       = (stock.changePct ?? 0) >= 0
  const rsiColor = stock.rsi == null ? '#4b6358'
                 : stock.rsi >= 65  ? '#e24b4a'
                 : stock.rsi <= 35  ? '#1D9E75'
                 : '#4b6358'
  const rsiLabel = stock.rsi == null ? '—'
                 : stock.rsi >= 65  ? 'Overbought'
                 : stock.rsi <= 35  ? 'Oversold'
                 : 'Neutral'
  const bbLabel  = stock.bbPct == null ? '—'
                 : stock.bbPct >= 75  ? 'Near Top'
                 : stock.bbPct <= 25  ? 'Near Bottom'
                 : 'Mid Band'

  return (
    <div
      onClick={() => onSelect(stock.symbol)}
      className="bg-[#0a0f0d] border border-[#1a2e1f] rounded-xl p-4 flex flex-col gap-3 cursor-pointer hover:border-[#263d2c] hover:bg-[#0c1410] transition-all duration-150 animate-enter"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-bold text-[#d1d9d5]">{stock.symbol}</span>
          <span className="text-xs text-[#4b6358] ml-1.5 truncate">{stock.name}</span>
        </div>
        <span className={`text-xs font-bold tabular-nums shrink-0 ${up ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}`}>
          {up ? '+' : ''}{(stock.changePct ?? 0).toFixed(2)}%
        </span>
      </div>

      <span className="text-2xl font-black tabular-nums text-[#d1d9d5] leading-none">
        ${stock.price?.toFixed(2) ?? '—'}
      </span>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1a2e1f]">
        <div>
          <p className="text-[9px] text-[#4b6358] uppercase tracking-widest mb-1">RSI (14)</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: rsiColor }}>
            {stock.rsi ?? '—'}{' '}
            <span className="text-[10px] font-normal text-[#4b6358]">{rsiLabel}</span>
          </p>
        </div>
        <div>
          <p className="text-[9px] text-[#4b6358] uppercase tracking-widest mb-1">BB Position</p>
          <p className="text-xs font-bold tabular-nums text-[#d1d9d5]">
            {stock.bbPct != null ? `${stock.bbPct}%` : '—'}{' '}
            <span className="text-[10px] font-normal text-[#4b6358]">{bbLabel}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-[#0a0f0d] border border-[#1a2e1f] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded-full shimmer" />
        <div className="h-3 w-10 rounded-full shimmer" />
      </div>
      <div className="h-7 w-24 rounded-full shimmer" />
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#1a2e1f]">
        <div className="h-8 rounded-lg shimmer" />
        <div className="h-8 rounded-lg shimmer" />
      </div>
    </div>
  )
}

export default function Screener({ open, onClose, onAnalyze }) {
  const [stocks,  setStocks]  = useState([])
  const [loading, setLoading] = useState(true)  // start true so skeletons show immediately
  const [filters, setFilters] = useState(INIT_FILTERS)
  const [fetchError, setFetchError] = useState(null)

  const loadStocks = () => {
    setLoading(true)
    setFetchError(null)
    fetch('/api/screener')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => setStocks(d.stocks ?? []))
      .catch(() => setFetchError('Unable to load screener data. Please try again.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    if (stocks.length) { setLoading(false); return }  // already cached
    loadStocks()
  }, [open])

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val }))
  const reset     = () => setFilters(INIT_FILTERS)
  const filtered  = stocks.filter(s => matches(s, filters))
  const isFiltered = Object.values(filters).some(v => v !== 'all')

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl h-full bg-[#080c0a] border-l border-[#1a2e1f] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2e1f] shrink-0">
          <div>
            <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Stock Screener</span>
            {isFiltered && (
              <button onClick={reset} className="ml-3 text-[10px] text-[#1D9E75] hover:underline">
                Clear filters
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-[#4b6358] hover:text-[#d1d9d5] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 flex flex-col gap-4 border-b border-[#1a2e1f] shrink-0">
          {FILTERS.map(def => (
            <FilterChips
              key={def.key}
              def={def}
              value={filters[def.key]}
              onChange={val => setFilter(def.key, val)}
            />
          ))}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-[10px] text-[#4b6358] mb-3">
            {loading ? 'Loading…' : fetchError ? '' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''} · click any card to analyze`}
          </p>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : fetchError ? (
            <div className="text-center py-16 flex flex-col gap-3">
              <p className="text-sm text-[#4b6358]">{fetchError}</p>
              <button onClick={loadStocks} className="text-xs text-[#1D9E75] hover:underline">
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 flex flex-col gap-3">
              <p className="text-sm text-[#4b6358]">No stocks match these filters.</p>
              <button onClick={reset} className="text-xs text-[#1D9E75] hover:underline">
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(stock => (
                <StockCard
                  key={stock.symbol}
                  stock={stock}
                  onSelect={sym => { onClose(); onAnalyze(sym) }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
