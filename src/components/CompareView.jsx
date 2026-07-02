import { useState, useEffect, useCallback } from 'react'
import { fetchMarket } from '../services/finnhub'
import { fetchAnalysis } from '../services/analyze'
import { calcRSI, calcMACD, calcBBPosition } from '../utils/indicators'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n, digits = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(digits)
}

function fmtCap(n) {
  if (!n) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

function fmtPrice(n) {
  if (n == null) return '—'
  return `$${Number(n).toFixed(2)}`
}

const SIGNAL_COLOR = { BUY: '#22B585', SELL: '#ef5454', HOLD: '#e3a234' }
const RISK_COLOR   = { LOW: '#22B585', HIGH: '#ef5454', MEDIUM: '#e3a234' }

// ─── per-side state hook ──────────────────────────────────────────────────────

function useSide() {
  const [loading, setLoading] = useState(false)
  const [data,    setData]    = useState(null)
  const [error,   setError]   = useState(null)

  const load = useCallback(async (sym) => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const { quote, profile, metrics, candles, synthetic } = await fetchMarket(sym)
      if (!quote?.c) throw new Error('No data')

      const rsi  = calcRSI(candles, 14, quote?.c)
      const macd = calcMACD(candles, quote?.c)
      const bb   = calcBBPosition(candles, 20, quote?.c)

      const ai = await fetchAnalysis({ ticker: sym, quote, profile, metrics, candles, synthetic })
        .catch(() => null)

      setData({ quote, profile, metrics, candles, rsi, macd, bb, ai })
    } catch {
      setError('Could not load data for this ticker.')
    }
    setLoading(false)
  }, [])

  return { loading, data, error, load }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Shimmer({ h = 40 }) {
  return <div className="shimmer rounded-lg" style={{ height: h }} />
}

function MetricRow({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--c-border)] last:border-0">
      <span className="text-[10px] text-[var(--c-text-faint)] uppercase tracking-wide">{label}</span>
      <span
        className="text-xs font-semibold tabular-nums"
        style={{ color: highlight ?? '#d1d9d5' }}
      >
        {value}
      </span>
    </div>
  )
}

function SidePanel({ ticker, loading, data, error }) {
  if (loading) return (
    <div className="flex flex-col gap-3">
      <Shimmer h={80} />
      <Shimmer h={100} />
      <Shimmer h={120} />
    </div>
  )

  if (error) return (
    <div className="rounded-xl border border-[#ef5454]/25 bg-[#ef5454]/05 p-4 text-xs text-[#ef5454]">
      {error}
    </div>
  )

  if (!data) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-xs text-[var(--c-text-fainter)] text-center px-4">Enter a ticker and click Compare</p>
    </div>
  )

  const { quote, profile, metrics, rsi, macd, bb, ai } = data
  const up     = (quote.dp ?? 0) >= 0
  const sc     = ai ? SIGNAL_COLOR[ai.verdict] ?? '#d1d9d5' : null
  const rc     = ai ? RISK_COLOR[ai.riskLevel]  ?? '#e3a234' : null

  const rsiZone = rsi == null ? '—'
    : rsi >= 70 ? 'Overbought'
    : rsi <= 30 ? 'Oversold'
    : 'Neutral'
  const rsiColor = rsi == null ? '#4b6358'
    : rsi >= 70 ? '#ef5454'
    : rsi <= 30 ? '#22B585'
    : '#d1d9d5'

  const hi52 = metrics?.metric?.['52WeekHigh']
  const lo52 = metrics?.metric?.['52WeekLow']
  const rangePos = (hi52 && lo52 && hi52 !== lo52)
    ? Math.max(0, Math.min(1, (quote.c - lo52) / (hi52 - lo52)))
    : null

  return (
    <div className="flex flex-col gap-3">

      {/* Price card */}
      <div className="glass-card rounded-xl p-4">
        <div className="text-[10px] text-[var(--c-text-faint)] uppercase tracking-widest mb-2 font-semibold">
          {profile?.name ?? ticker}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-black text-[var(--c-text)] tabular-nums">{fmtPrice(quote.c)}</span>
          <span className={`text-sm font-bold tabular-nums ${up ? 'text-[#22B585]' : 'text-[#ef5454]'}`}>
            {up ? '+' : ''}{fmt(quote.dp)}%
          </span>
        </div>
        <div className="text-[10px] text-[var(--c-text-faint)] mt-1">
          {profile?.finnhubIndustry} · {profile?.exchange}
        </div>
      </div>

      {/* AI signal */}
      {ai ? (
        <div className="glass-card rounded-xl p-4">
          <div className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-widest mb-3 font-semibold">AI Signal</div>
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-sm font-black px-3 py-1.5 rounded-lg border"
              style={{ color: sc, borderColor: `${sc}50`, background: `${sc}12` }}
            >
              {ai.verdict}
            </span>
            <div className="flex flex-col gap-0.5 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-wide">Confidence</span>
                <span className="text-[10px] font-bold" style={{ color: sc }}>{ai.confidence}/100</span>
              </div>
              <div className="h-1.5 bg-[var(--c-input-bg)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${ai.confidence}%`, background: sc }}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg p-2">
              <div className="text-[9px] text-[var(--c-text-faint)] uppercase mb-1">Entry</div>
              <div className="text-xs font-bold text-[var(--c-text)]">{fmtPrice(ai.entryPrice)}</div>
            </div>
            <div className="flex-1 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg p-2">
              <div className="text-[9px] text-[var(--c-text-faint)] uppercase mb-1">Stop</div>
              <div className="text-xs font-bold text-[#ef5454]">{fmtPrice(ai.stopLoss)}</div>
            </div>
            <div className="flex-1 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-lg p-2">
              <div className="text-[9px] text-[var(--c-text-faint)] uppercase mb-1">Risk</div>
              <div className="text-xs font-bold" style={{ color: rc }}>{ai.riskLevel}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-xl p-4">
          <div className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-widest font-semibold">AI Signal</div>
          <div className="text-xs text-[var(--c-text-fainter)] mt-2">Analysis unavailable</div>
        </div>
      )}

      {/* Technicals */}
      <div className="glass-card rounded-xl p-4">
        <div className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-widest mb-3 font-semibold">Technicals</div>
        <MetricRow
          label="RSI (14)"
          value={rsi != null ? `${fmt(rsi, 1)} · ${rsiZone}` : '—'}
          highlight={rsiColor}
        />
        <MetricRow
          label="MACD"
          value={macd ? (macd.bullish ? 'Bullish' : 'Bearish') : '—'}
          highlight={macd ? (macd.bullish ? '#22B585' : '#ef5454') : undefined}
        />
        <MetricRow
          label="Bollinger %"
          value={bb ? `${bb.pct}%` : '—'}
          highlight={
            bb == null ? undefined
              : bb.pct >= 80 ? '#ef5454'
              : bb.pct <= 20 ? '#22B585'
              : '#d1d9d5'
          }
        />
        {rangePos != null && (
          <div className="mt-2 pt-2 border-t border-[var(--c-border)]">
            <div className="flex justify-between text-[9px] text-[var(--c-text-faint)] mb-1">
              <span>52W Low {fmtPrice(lo52)}</span>
              <span>{fmtPrice(hi52)} 52W High</span>
            </div>
            <div className="h-1.5 bg-[var(--c-input-bg)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#22B585] rounded-full"
                style={{ width: `${rangePos * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Fundamentals */}
      <div className="glass-card rounded-xl p-4">
        <div className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-widest mb-3 font-semibold">Fundamentals</div>
        <MetricRow label="Market Cap" value={fmtCap(profile?.marketCapitalization)} />
        <MetricRow label="P/E (TTM)"  value={fmt(metrics?.metric?.peBasicExclExtraTTM, 1)} />
        <MetricRow label="EPS Growth (5Y)" value={metrics?.metric?.epsGrowth5Y != null ? `${fmt(metrics.metric.epsGrowth5Y, 1)}%` : '—'} />
        <MetricRow label="Beta"       value={fmt(metrics?.metric?.beta)} />
      </div>

    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

// Max 4 tickers per Phase 6 spec; min 2 to make a comparison.
const MAX_SLOTS = 4
const MIN_SLOTS = 2

function LeaderChip({ label, ticker, color }) {
  if (!ticker) return null
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded-md border"
      style={{ color, borderColor: `${color}45`, backgroundColor: `${color}12` }}
    >
      <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">{label}</span>
      <span className="text-[11px] font-black tabular-nums">{ticker}</span>
    </div>
  )
}

function ComparisonCard({ compare }) {
  if (!compare) return null
  if (compare === 'loading') {
    return (
      <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-fade">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22B585] animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
            Comparing…
          </span>
        </div>
        <div className="h-3 rounded-full shimmer w-11/12" />
        <div className="h-3 rounded-full shimmer w-3/4" />
        <div className="h-3 rounded-full shimmer w-2/3" />
      </div>
    )
  }
  if (compare === 'error') {
    return (
      <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex items-start gap-3 animate-fade">
        <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] text-[var(--c-text-fainter)] flex items-center justify-center text-xs">i</span>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em]">
            Comparison
          </span>
          <p className="text-[12.5px] text-[var(--c-text)]/80 leading-relaxed">
            AI comparison temporarily unavailable — the per-ticker panels below still show every metric side by side.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-enter">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22B585]" />
          Head-to-Head
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <LeaderChip label="Momentum" ticker={compare.leaders?.momentum} color="#22B585" />
          <LeaderChip label="Value"    ticker={compare.leaders?.value}    color="#e3a234" />
          <LeaderChip label="Quality"  ticker={compare.leaders?.quality}  color="#d1d9d5" />
        </div>
      </div>
      <p className="text-[13.5px] text-[var(--c-text)]/90 leading-relaxed">
        {compare.commentary}
      </p>
    </div>
  )
}

export default function CompareView({ open, onClose, initialTickers }) {
  // Slots: array of { input, side }. React hooks disallow variable-count
  // hook calls, so we always create MAX_SLOTS worth of useSide instances
  // and only render/use the first `activeCount` of them.
  const side0 = useSide()
  const side1 = useSide()
  const side2 = useSide()
  const side3 = useSide()
  const sides = [side0, side1, side2, side3]

  const [inputs, setInputs] = useState(() =>
    Array.from({ length: MAX_SLOTS }, (_, i) => initialTickers?.[i] ?? '')
  )
  const [activeCount, setActiveCount] = useState(() =>
    Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, (initialTickers ?? []).length || MIN_SLOTS))
  )
  const [compare, setCompare] = useState(null) // null | 'loading' | 'error' | { commentary, leaders }

  // Auto-load whatever was pre-filled on open (e.g. via "vs SPY" chip).
  useEffect(() => {
    if (!open) return
    for (let i = 0; i < MAX_SLOTS; i++) {
      const t = initialTickers?.[i]
      if (t) sides[i].load(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTickers?.[0], initialTickers?.[1], initialTickers?.[2], initialTickers?.[3]])

  const setInputAt = (i, val) => {
    setInputs(prev => prev.map((v, idx) => (idx === i ? val : v)))
  }

  const handleCompare = () => {
    setCompare(null)
    for (let i = 0; i < activeCount; i++) {
      const t = inputs[i].trim().toUpperCase()
      if (t) sides[i].load(t)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleCompare()
  }

  const addSlot    = () => setActiveCount(c => Math.min(MAX_SLOTS, c + 1))
  const removeSlot = (i) => {
    if (activeCount <= MIN_SLOTS) return
    // Drop the requested slot: shift subsequent slots' inputs + loaded data
    // left so the visible list stays contiguous.
    const newInputs = inputs.slice()
    newInputs.splice(i, 1)
    newInputs.push('')
    setInputs(newInputs)
    for (let j = i; j < MAX_SLOTS - 1; j++) {
      const next = sides[j + 1]
      // We can't mutate the useSide state from outside; instead re-call load
      // for slots that still have a ticker. Slots that were empty stay empty.
      if (next.data && newInputs[j]) sides[j].load(newInputs[j])
    }
    setActiveCount(c => c - 1)
    setCompare(null)
  }

  // Kick off AI comparison once every active slot with a ticker has data.
  useEffect(() => {
    const loaded = sides.slice(0, activeCount).filter(s => s.data && !s.loading)
    if (loaded.length < 2) return
    // Serialize snapshot for the compare endpoint.
    const snapshots = loaded.map(s => {
      const { quote, profile, metrics, rsi, macd, bb, ai } = s.data
      return {
        ticker:       (profile?.ticker ?? '').toUpperCase() || undefined,
        price:        quote?.c,
        dp:           quote?.dp,
        rsi,
        macd:         macd ? { bullish: macd.bullish } : null,
        bb:           bb ? { pct: bb.pct } : null,
        pe:           metrics?.metric?.peBasicExclExtraTTM,
        epsGrowth5Y:  metrics?.metric?.epsGrowth5Y,
        beta:         metrics?.metric?.beta,
        marketCap:    profile?.marketCapitalization,
        verdict:      ai?.verdict,
      }
    })
    // Backfill ticker from the input if the profile didn't carry one.
    for (let i = 0; i < snapshots.length; i++) {
      if (!snapshots[i].ticker) snapshots[i].ticker = inputs[i].trim().toUpperCase()
    }
    // Deduplicate by ticker (prevents accidental duplicate slot compare).
    const seen = new Set()
    const unique = snapshots.filter(s => {
      if (!s.ticker || seen.has(s.ticker)) return false
      seen.add(s.ticker); return true
    })
    if (unique.length < 2) return

    let cancelled = false
    setCompare('loading')
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'compare', tickers: unique }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`compare ${r.status}`)))
      .then(data => { if (!cancelled) setCompare(data) })
      .catch(() => { if (!cancelled) setCompare('error') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCount,
    sides[0].data, sides[1].data, sides[2].data, sides[3].data,
    sides[0].loading, sides[1].loading, sides[2].loading, sides[3].loading,
  ])

  if (!open) return null

  const inputCls = "w-full min-w-0 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors uppercase"

  // Column classes for 2/3/4 sides. Mobile stacks; md+ shows the requested
  // fan-out. Adjusted so 4 sides don't get so narrow that numbers wrap.
  const gridCls = activeCount === 2 ? 'grid-cols-1 md:grid-cols-2'
              : activeCount === 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'

  return (
    <div className="fixed inset-0 z-50 bg-[var(--c-bg)] flex flex-col" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="border-b border-[var(--c-border)] px-6 py-4 flex items-center gap-3 shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">
          Compare ({activeCount})
        </span>

        {/* Dynamic ticker inputs. Each active slot gets a small remove-X when
            we're above MIN_SLOTS so users can drop the least-useful side. */}
        <div className="flex items-center gap-2 flex-1 flex-wrap max-w-[720px]">
          {Array.from({ length: activeCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-1 min-w-[110px] flex-1">
              <input
                type="text"
                value={inputs[i]}
                onChange={e => setInputAt(i, e.target.value.toUpperCase())}
                onKeyDown={handleKey}
                placeholder={['AAPL','MSFT','NVDA','AMD'][i]}
                maxLength={6}
                className={inputCls}
              />
              {activeCount > MIN_SLOTS && (
                <button
                  onClick={() => removeSlot(i)}
                  aria-label={`Remove slot ${i + 1}`}
                  title="Remove this ticker"
                  className="shrink-0 text-[var(--c-text-fainter)] hover:text-[#ef5454] transition-colors p-1 cursor-pointer"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {activeCount < MAX_SLOTS && (
            <button
              onClick={addSlot}
              title="Add another ticker (up to 4)"
              className="shrink-0 border border-[var(--c-border)] hover:border-[#22B585]/50 text-[var(--c-text-faint)] hover:text-[#22B585] text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              + Add
            </button>
          )}
          <button
            onClick={handleCompare}
            className="shrink-0 bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.97] text-white text-xs font-bold px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
          >
            Compare
          </button>
        </div>

        <button onClick={onClose} className="ml-auto text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors p-1 cursor-pointer shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Scrollable content: AI comparison card at top (when we have 2+
          loaded), then the per-side panels grid. */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
        <ComparisonCard compare={compare} />

        <div className={`grid ${gridCls} gap-4`}>
          {Array.from({ length: activeCount }).map((_, i) => (
            <SidePanel
              key={i}
              ticker={inputs[i]}
              loading={sides[i].loading}
              data={sides[i].data}
              error={sides[i].error}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
