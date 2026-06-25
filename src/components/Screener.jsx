import { useState, useEffect, useRef } from 'react'
import EmptyState from './EmptyState'
import ErrorCard from './ErrorCard'

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
      { value: 'all',        label: 'All'          },
      { value: 'oversold',   label: 'Oversold <35'  },
      { value: 'neutral',    label: 'Neutral'       },
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

// AV free tier: 5 req/min — fetch in batches of 5, 62 s cooldown between batches
const INDICATOR_BATCH = 5
const INDICATOR_GAP   = 62_000

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
      <p className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest mb-2">{def.label}</p>
      <div className="flex flex-wrap gap-1.5">
        {def.opts.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
              value === opt.value
                ? 'bg-[#1D9E75] text-white border-[#1D9E75]'
                : 'bg-[var(--c-bg-deep)] text-[var(--c-text-faint)] border-[var(--c-border)] hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function IndicatorCell({ label, value, loading, colorFn, labelFn }) {
  return (
    <div>
      <p className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-widest mb-1">{label}</p>
      {loading ? (
        <div className="h-3.5 w-20 rounded-full shimmer mt-0.5" />
      ) : (
        <p className="text-xs font-bold tabular-nums" style={{ color: colorFn ? colorFn(value) : '#d1d9d5' }}>
          {value != null ? value : '—'}{' '}
          {labelFn && value != null && (
            <span className="text-[10px] font-normal text-[var(--c-text-faint)]">{labelFn(value)}</span>
          )}
        </p>
      )}
    </div>
  )
}

const rsiColor = v => v >= 65 ? '#e24b4a' : v <= 35 ? '#1D9E75' : '#4b6358'
const rsiLabel = v => v >= 65 ? 'Overbought' : v <= 35 ? 'Oversold' : 'Neutral'
const bbLabel  = v => v >= 75 ? 'Near Top' : v <= 25 ? 'Near Bottom' : 'Mid Band'

function StockCard({ stock, indicatorLoading, onSelect }) {
  const up = (stock.changePct ?? 0) >= 0
  return (
    <div
      onClick={() => onSelect(stock.symbol)}
      className="bg-[var(--c-bg-deep)] border border-[var(--c-border)] rounded-xl p-4 flex flex-col gap-3 cursor-pointer hover:border-[var(--c-border-strong)] hover:bg-[#0c1410] transition-all duration-150 animate-enter"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-bold text-[var(--c-text)]">{stock.symbol}</span>
          <span className="text-xs text-[var(--c-text-faint)] ml-1.5 truncate">{stock.name}</span>
        </div>
        <span className={`text-xs font-bold tabular-nums shrink-0 ${up ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}`}>
          {up ? '+' : ''}{(stock.changePct ?? 0).toFixed(2)}%
        </span>
      </div>

      <span className="text-2xl font-black tabular-nums text-[var(--c-text)] leading-none">
        ${stock.price?.toFixed(2) ?? '—'}
      </span>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--c-border)]">
        <IndicatorCell
          label="RSI (14)"
          value={stock.rsi}
          loading={indicatorLoading}
          colorFn={rsiColor}
          labelFn={rsiLabel}
        />
        <IndicatorCell
          label="BB Position"
          value={stock.bbPct != null ? `${stock.bbPct}%` : null}
          loading={indicatorLoading}
          labelFn={v => bbLabel(parseInt(v))}
        />
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-[var(--c-bg-deep)] border border-[var(--c-border)] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded-full shimmer" />
        <div className="h-3 w-10 rounded-full shimmer" />
      </div>
      <div className="h-7 w-24 rounded-full shimmer" />
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--c-border)]">
        <div className="h-8 rounded-lg shimmer" />
        <div className="h-8 rounded-lg shimmer" />
      </div>
    </div>
  )
}

export default function Screener({ open, onClose, onAnalyze }) {
  const [stocks,      setStocks]      = useState([])
  const [indicators,  setIndicators]  = useState({})  // { [symbol]: { rsi, bbPct } }
  const [indLoaded,   setIndLoaded]   = useState(0)   // count of settled indicator fetches
  const [loading,     setLoading]     = useState(true)
  const [filters,     setFilters]     = useState(INIT_FILTERS)
  const [fetchError,  setFetchError]  = useState(null)
  const cancelRef = useRef(false)

  const loadStocks = () => {
    setLoading(true)
    setFetchError(null)
    setIndicators({})
    setIndLoaded(0)
    cancelRef.current = true   // cancel any in-flight indicator run
    fetch('/api/screener')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { cancelRef.current = false; setStocks(d.stocks ?? []) })
      .catch(() => setFetchError('Unable to load screener data. Please try again.'))
      .finally(() => setLoading(false))
  }

  // Load quotes on open (cached in state across opens)
  useEffect(() => {
    if (!open) return
    if (stocks.length) { setLoading(false); return }
    loadStocks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Progressive indicator loading after quotes arrive
  useEffect(() => {
    if (!stocks.length) return
    // Skip if we already have all indicators
    if (Object.keys(indicators).length >= stocks.length) return

    cancelRef.current = false

    ;(async () => {
      for (let i = 0; i < stocks.length; i += INDICATOR_BATCH) {
        if (cancelRef.current) return
        const batch = stocks.slice(i, i + INDICATOR_BATCH)

        await Promise.allSettled(
          batch.map(async ({ symbol }) => {
            if (cancelRef.current) return
            try {
              const r = await fetch(`/api/screener-indicators?ticker=${symbol}`)
              if (cancelRef.current) return
              if (r.status === 429) return   // rate-limited — skip, not cached
              if (!r.ok) return
              const d = await r.json()
              if (!cancelRef.current) {
                setIndicators(prev => ({ ...prev, [symbol]: d }))
              }
            } catch {}
          })
        )

        if (!cancelRef.current) setIndLoaded(Math.min(i + INDICATOR_BATCH, stocks.length))

        // Wait between batches to respect AV 5 req/min limit
        if (i + INDICATOR_BATCH < stocks.length && !cancelRef.current) {
          await new Promise(r => setTimeout(r, INDICATOR_GAP))
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks])

  const setFilter   = (key, val) => setFilters(f => ({ ...f, [key]: val }))
  const reset       = () => setFilters(INIT_FILTERS)
  const isFiltered  = Object.values(filters).some(v => v !== 'all')
  const techFiltered = filters.rsi !== 'all' || filters.bb !== 'all'

  const allLoaded    = stocks.length > 0 && Object.keys(indicators).length >= stocks.length
  const indProgress  = `${Math.min(indLoaded, stocks.length)} / ${stocks.length}`
  const showIndStatus = stocks.length > 0 && !allLoaded && !loading

  const merged = stocks.map(s => ({
    ...s,
    rsi:   indicators[s.symbol]?.rsi   ?? null,
    bbPct: indicators[s.symbol]?.bbPct ?? null,
    indicatorLoading: !indicators[s.symbol],
  }))
  const filtered = merged.filter(s => matches(s, filters))

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl h-full bg-[var(--c-bg)] border-l border-[var(--c-border)] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] shrink-0">
          <div>
            <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Stock Screener</span>
            {isFiltered && (
              <button onClick={reset} className="ml-3 text-[10px] text-[#1D9E75] hover:underline">
                Clear filters
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 flex flex-col gap-4 border-b border-[var(--c-border)] shrink-0">
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
          {/* Status line */}
          <div className="flex items-center justify-between mb-3 min-h-[18px]">
            {loading ? (
              <p className="text-[10px] text-[var(--c-text-faint)]">Loading…</p>
            ) : fetchError ? null : (
              <p className="text-[10px] text-[var(--c-text-faint)]">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} · click to analyze
              </p>
            )}
            {showIndStatus && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
                <p className="text-[10px] text-[var(--c-text-faint)]">
                  {techFiltered
                    ? `Loading indicators (${indProgress})…`
                    : `Technical data ${indProgress}`}
                </p>
              </div>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : fetchError ? (
            <ErrorCard message={fetchError} onRetry={loadStocks} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M1.5 3.5h13M4 8h8M6.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              title={techFiltered && !allLoaded ? 'Indicators still loading' : 'No matches'}
              body={
                techFiltered && !allLoaded
                  ? 'Results will appear as indicator data arrives. Hang tight.'
                  : 'No stocks match these filters. Try widening your criteria.'
              }
              action={(!techFiltered || allLoaded) ? { label: 'Reset filters', onClick: reset } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(stock => (
                <StockCard
                  key={stock.symbol}
                  stock={stock}
                  indicatorLoading={stock.indicatorLoading}
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
