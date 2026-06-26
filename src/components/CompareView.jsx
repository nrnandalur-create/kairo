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

      const rsi  = calcRSI(candles)
      const macd = calcMACD(candles)
      const bb   = calcBBPosition(candles)

      const ai = await fetchAnalysis({ ticker: sym, quote, profile, metrics, candles })
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

export default function CompareView({ open, onClose, initialTickers }) {
  const [leftTicker,  setLeftTicker]  = useState(initialTickers?.[0] ?? '')
  const [rightTicker, setRightTicker] = useState(initialTickers?.[1] ?? '')
  const left  = useSide()
  const right = useSide()

  // Auto-load whatever was pre-filled on open (e.g. via "vs SPY" chip).
  useEffect(() => {
    if (!open) return
    if (initialTickers?.[0]) left.load(initialTickers[0])
    if (initialTickers?.[1]) right.load(initialTickers[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTickers?.[0], initialTickers?.[1]])

  const handleCompare = () => {
    const l = leftTicker.trim().toUpperCase()
    const r = rightTicker.trim().toUpperCase()
    if (l) left.load(l)
    if (r) right.load(r)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') handleCompare()
  }

  if (!open) return null

  const inputCls = "flex-1 min-w-0 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-3 py-2 text-sm font-bold text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors uppercase"

  return (
    <div className="fixed inset-0 z-50 bg-[var(--c-bg)] flex flex-col" onClick={e => e.stopPropagation()}>

      {/* Header */}
      <div className="border-b border-[var(--c-border)] px-6 py-4 flex items-center gap-4 shrink-0">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Compare</span>

        {/* Ticker inputs */}
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <input
            type="text"
            value={leftTicker}
            onChange={e => setLeftTicker(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            placeholder="AAPL"
            maxLength={5}
            className={inputCls}
          />
          <span className="text-[var(--c-text-fainter)] text-sm font-bold shrink-0">vs</span>
          <input
            type="text"
            value={rightTicker}
            onChange={e => setRightTicker(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            placeholder="MSFT"
            maxLength={5}
            className={inputCls}
          />
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

      {/* Column labels */}
      {(left.data || right.data || left.loading || right.loading) && (
        <div className="grid grid-cols-2 gap-4 px-6 pt-4 shrink-0">
          <div className="text-xs font-black text-[var(--c-text)] uppercase tracking-widest">
            {leftTicker || '—'}
          </div>
          <div className="text-xs font-black text-[var(--c-text)] uppercase tracking-widest">
            {rightTicker || '—'}
          </div>
        </div>
      )}

      {/* Two-column content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-4">
          <SidePanel
            ticker={leftTicker}
            loading={left.loading}
            data={left.data}
            error={left.error}
          />
          <SidePanel
            ticker={rightTicker}
            loading={right.loading}
            data={right.data}
            error={right.error}
          />
        </div>
      </div>
    </div>
  )
}
