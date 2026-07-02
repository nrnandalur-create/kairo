import { useState, useEffect } from 'react'
import { toast } from '../utils/toast'
import { useSubscription } from '../hooks/useSubscription'

// Per-row form validation. Empty rows are tolerated (so the user can scaffold).
// Once either field has content, both must be present and valid. Cost is
// optional — required to compute unrealized P&L but the portfolio still
// analyzes without it (falls back to today's change only).
function validateRow({ ticker, shares, cost }) {
  const t = (ticker ?? '').trim()
  const s = (shares ?? '').toString().trim()
  const c = (cost ?? '').toString().trim()
  const errors = { ticker: null, shares: null, cost: null }
  if (t && !/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(t)) errors.ticker = '1–5 letters'
  if (s && (!Number.isFinite(+s) || +s <= 0)) errors.shares = 'Must be > 0'
  if (c && (!Number.isFinite(+c) || +c <= 0)) errors.cost   = 'Must be > 0'
  if (t && !s) errors.shares = 'Required'
  if (!t && s) errors.ticker = 'Required'
  return errors
}

// Free-tier hard cap on positions. Pro tier / dev-override bypasses this.
// Kept as a constant so future changes to the tier limit have one edit point.
const FREE_TIER_POSITION_LIMIT = 3

import { usePortfolio } from '../hooks/usePortfolio'
import PortfolioChart from './PortfolioChart'
import PortfolioAIReport from './PortfolioAIReport'

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

function calcPortfolio(holdings, quotes) {
  const items = holdings.map(h => {
    const q       = quotes.find(x => x.symbol === h.ticker.toUpperCase())
    const price   = q?.price ?? null
    const value   = price != null ? price * +h.shares : null
    const chPct   = q?.changePct ?? null
    // Cost basis flows in from the form now (Phase 4). Missing cost is
    // treated as null so unrealized figures degrade gracefully — the AI
    // prompt handles the "N/A" case explicitly.
    const cost    = h.cost != null && +h.cost > 0 ? +h.cost : null
    const costBasisValue = cost != null ? cost * +h.shares : null
    const unrealizedPnL  = value != null && costBasisValue != null ? value - costBasisValue : null
    const unrealizedPct  = unrealizedPnL != null && costBasisValue > 0
      ? (unrealizedPnL / costBasisValue) * 100
      : null
    return {
      ...h,
      ticker: h.ticker.toUpperCase(),
      price, changePct: chPct, value,
      cost, costBasisValue, unrealizedPnL, unrealizedPct,
    }
  }).filter(h => h.value != null)

  const total     = items.reduce((s, h) => s + h.value, 0)
  const withWeight = items.map(h => ({ ...h, weight: total ? h.value / total : 0 }))

  // Aggregate unrealized P&L across positions that have a cost basis. If
  // NO position has a cost basis, both stay null and the UI just doesn't
  // render the "Total Gain/Loss" card (spec allows optional cost basis).
  const withCost      = withWeight.filter(h => h.costBasisValue != null)
  const totalCost     = withCost.length ? withCost.reduce((s, h) => s + h.costBasisValue, 0) : null
  const totalCurrent  = withCost.length ? withCost.reduce((s, h) => s + h.value, 0) : null
  const totalGainLoss = totalCost != null ? totalCurrent - totalCost : null
  const totalGainLossPct = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : null

  const weightedChangePct = withWeight.reduce((s, h) => s + h.weight * (h.changePct ?? 0), 0)
  const todayPnL          = total * weightedChangePct / 100

  const healthScore = Math.round(Math.max(0, Math.min(100, 50 + weightedChangePct * 5)))

  const maxWeight = Math.max(...withWeight.map(h => h.weight))
  const riskLevel = maxWeight > 0.4 || Math.min(...withWeight.map(h => h.changePct ?? 0)) < -5
    ? 'HIGH'
    : maxWeight <= 0.2 && weightedChangePct >= 0
    ? 'LOW'
    : 'MEDIUM'

  const riskColors = { LOW: '#22B585', MEDIUM: '#e3a234', HIGH: '#ef5454' }

  return {
    items: withWeight,
    total, todayPnL, weightedChangePct,
    totalCost, totalGainLoss, totalGainLossPct,
    healthScore, riskLevel, riskColor: riskColors[riskLevel],
  }
}

function HoldingRow({ h }) {
  const up     = (h.changePct ?? 0) >= 0
  const signal = (h.changePct ?? 0) >= 1 ? 'Bullish' : (h.changePct ?? 0) <= -1 ? 'Bearish' : 'Neutral'
  const sigCls = signal === 'Bullish'
    ? 'bg-[#22B585]/10 text-[#22B585] border-[#22B585]/25'
    : signal === 'Bearish'
    ? 'bg-[#ef5454]/10 text-[#ef5454] border-[#ef5454]/25'
    : 'bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] border-[var(--c-border)]'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0 flex-wrap">
      <span className="text-sm font-bold text-[var(--c-text)] w-14 shrink-0">{h.ticker}</span>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-xs tabular-nums text-[var(--c-text)]">{fmtMoney(h.value)}</span>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--c-text-faint)]">
          <span className="tabular-nums">{Math.round(h.weight * 100)}%</span>
          <span>·</span>
          <span className={`tabular-nums font-semibold ${up ? 'text-[#22B585]' : 'text-[#ef5454]'}`}>
            {up ? '+' : ''}{(h.changePct ?? 0).toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="h-1 flex-1 hidden sm:block bg-[var(--c-chip-bg)] rounded-full overflow-hidden">
        <div className="h-full bg-[#22B585]/40 rounded-full" style={{ width: `${Math.round(h.weight * 100)}%` }} />
      </div>
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest shrink-0 ${sigCls}`}>
        {signal}
      </span>
    </div>
  )
}

export default function Portfolio({ open, onClose, onAnalyze, userId }) {
  const [holdings,   setHoldings]   = useState([{ ticker: '', shares: '', cost: '' }])
  const [quotes,     setQuotes]     = useState([])
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState('')
  const [aiReport,   setAiReport]   = useState(null)    // null | 'loading' | object
  const [aiError,    setAiError]    = useState('')

  // Subscription entitlements — feature gate the free tier. The dev override
  // (nrnandalur@gmail.com) short-circuits inside useSubscription so gating
  // never fires for that account regardless of Stripe state.
  const { isPro } = useSubscription()

  const { holdings: savedHoldings, snapshots, loading: portfolioLoading, upsertHolding } = usePortfolio(userId)

  // Pre-populate form from Supabase when modal opens (only when not viewing results).
  // Cost basis pulled from avg_cost so the user's saved unrealized P&L is preserved.
  useEffect(() => {
    if (!open || result || portfolioLoading || savedHoldings.length === 0) return
    setHoldings(savedHoldings.map(h => ({
      ticker: h.ticker,
      shares: String(h.shares),
      cost:   h.avg_cost ? String(h.avg_cost) : '',
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, result, savedHoldings, portfolioLoading])

  const update = (i, field, val) =>
    setHoldings(h => h.map((x, idx) => idx === i ? { ...x, [field]: val } : x))

  // Free-tier position cap. Pro bypasses. When a free user tries to add the
  // 4th+ position we show an upgrade toast + block the add — no silent fail.
  const canAddMore = isPro || holdings.length < FREE_TIER_POSITION_LIMIT
  const add    = () => {
    if (!canAddMore) {
      toast.show(`Free tier is limited to ${FREE_TIER_POSITION_LIMIT} positions. Upgrade to Pro for unlimited holdings.`)
      return
    }
    setHoldings(h => [...h, { ticker: '', shares: '', cost: '' }])
  }
  const remove = (i) => {
    const removed = holdings[i]
    setHoldings(h => h.filter((_, idx) => idx !== i))
    if (removed?.ticker?.trim()) toast.show(`${removed.ticker.trim()} removed`)
  }

  // Live per-row validation
  const rowErrors = holdings.map(validateRow)
  const anyRowError = rowErrors.some(e => e.ticker || e.shares)
  const completedRows = holdings.filter(h => h.ticker.trim() && (+h.shares > 0)).length
  const canSubmit = !anyRowError && completedRows > 0 && !loading

  const analyze = async () => {
    const valid = holdings.filter(h => h.ticker.trim() && +h.shares > 0)
    if (!valid.length) { setError('Add at least one holding with a ticker and share count.'); return }
    // Free tier: hard cap at N positions regardless of what the user entered.
    // Filtering here (not just at "+ Add") protects against pasted rows.
    if (!isPro && valid.length > FREE_TIER_POSITION_LIMIT) {
      setError(`Free tier is limited to ${FREE_TIER_POSITION_LIMIT} positions. Upgrade to Pro for unlimited holdings.`)
      return
    }
    setError('')
    setLoading(true)
    try {
      const syms = valid.map(h => h.ticker.trim().toUpperCase())
      const r    = await fetch(`/api/quotes?symbols=${syms.join(',')}`)
      const d    = await r.json()
      const q    = d.quotes ?? []
      setQuotes(q)
      setResult(calcPortfolio(valid, q))
      setAiReport(null)
      setAiError('')
      if (userId) {
        // Persist cost basis — was hardcoded to 0 before Phase 4, which meant
        // unrealized P&L could never compute. Now the user's real cost
        // basis flows through to Supabase and the AI analysis prompt.
        await Promise.all(valid.map(h => upsertHolding(
          h.ticker.trim(),
          h.shares,
          +h.cost > 0 ? h.cost : 0,
        )))
      }
      toast.success(`Portfolio analyzed · ${valid.length} holding${valid.length === 1 ? '' : 's'}`)
    } catch {
      setError('Failed to fetch prices. Check your tickers and try again.')
      toast.error("Couldn't fetch prices. Check your tickers and try again.")
    } finally {
      setLoading(false)
    }
  }

  const runAIAnalysis = async () => {
    if (!result) return
    setAiReport('loading')
    setAiError('')

    try {
      // Enrich holdings with avg_cost from saved holdings for unrealized P&L context
      const enriched = result.items.map(h => {
        const saved        = savedHoldings.find(s => s.ticker === h.ticker)
        const avgCost      = saved?.avg_cost ? +saved.avg_cost : null
        const unrealizedPct = avgCost && avgCost > 0 && h.price
          ? ((h.price - avgCost) / avgCost) * 100
          : null
        return {
          ticker: h.ticker,
          shares: +h.shares,
          price:  h.price,
          value:  h.value,
          weight: h.weight,
          changePct: h.changePct,
          avgCost,
          unrealizedPct,
        }
      })

      const body = {
        holdings:      enriched,
        snapshots:     snapshots.slice(-30).map(s => ({
          snapshot_date: s.snapshot_date,
          total_value:   +s.total_value,
          gain_loss_pct: +(s.gain_loss_pct ?? 0),
        })),
        total:          result.total,
        todayChangePct: result.weightedChangePct,
      }

      const res = await fetch('/api/portfolio-analysis', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })

      if (!res.ok) throw new Error(res.status)
      const data = await res.json()
      setAiReport(data)
    } catch {
      setAiReport(null)
      setAiError('AI analysis failed. Please try again.')
    }
  }

  const reset = () => {
    setHoldings([{ ticker: '', shares: '', cost: '' }])
    setQuotes([])
    setResult(null)
    setError('')
    setAiReport(null)
    setAiError('')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[var(--c-bg)] border border-[var(--c-border)] rounded-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] shrink-0">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Portfolio Analyzer</span>
          <button onClick={onClose} className="text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Holdings entry */}
          {!result && (
            <div className="px-6 py-5 flex flex-col gap-4">
              {userId && !portfolioLoading && savedHoldings.length === 0 ? (
                <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-4 flex items-start gap-3">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#22B585] shrink-0 mt-0.5">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  <p className="text-[11px] text-[var(--c-text-faint)] leading-relaxed">No positions tracked yet. Add your holdings below and they'll be saved automatically.</p>
                </div>
              ) : (
                <p className="text-xs text-[var(--c-text-faint)]">Enter your holdings to get a portfolio health snapshot.</p>
              )}

              <div className="flex flex-col gap-2">
                {holdings.map((h, i) => {
                  const err = rowErrors[i]
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          value={h.ticker}
                          onChange={e => update(i, 'ticker', e.target.value.toUpperCase())}
                          placeholder="AAPL"
                          maxLength={6}
                          aria-invalid={!!err.ticker}
                          className={`w-20 bg-[var(--c-input-bg)] border rounded-lg px-2.5 py-2 text-sm font-bold text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none transition-colors uppercase ${
                            err.ticker
                              ? 'border-[#ef5454] focus:border-[#ef5454]'
                              : 'border-[var(--c-border)] focus:border-[#22B585]'
                          }`}
                        />
                        <input
                          type="number"
                          value={h.shares}
                          onChange={e => update(i, 'shares', e.target.value)}
                          placeholder="Shares"
                          min="0"
                          aria-invalid={!!err.shares}
                          className={`flex-1 min-w-[70px] bg-[var(--c-input-bg)] border rounded-lg px-2.5 py-2 text-sm text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none transition-colors ${
                            err.shares
                              ? 'border-[#ef5454] focus:border-[#ef5454]'
                              : 'border-[var(--c-border)] focus:border-[#22B585]'
                          }`}
                        />
                        {/* Cost basis per share — optional. Present so the AI
                            portfolio prompt can compute unrealized P&L; missing
                            just means the analysis speaks only to today's move. */}
                        <input
                          type="number"
                          value={h.cost}
                          onChange={e => update(i, 'cost', e.target.value)}
                          placeholder="Cost $/sh"
                          min="0"
                          step="0.01"
                          aria-invalid={!!err.cost}
                          className={`w-24 min-w-[80px] bg-[var(--c-input-bg)] border rounded-lg px-2.5 py-2 text-sm tabular-nums text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none transition-colors ${
                            err.cost
                              ? 'border-[#ef5454] focus:border-[#ef5454]'
                              : 'border-[var(--c-border)] focus:border-[#22B585]'
                          }`}
                        />
                        {holdings.length > 1 && (
                          <button
                            onClick={() => remove(i)}
                            aria-label="Remove holding"
                            title="Remove this holding"
                            className="text-[var(--c-text-fainter)] hover:text-[#ef5454] transition-colors p-1 shrink-0 cursor-pointer"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      {(err.ticker || err.shares || err.cost) && (
                        <div className="flex gap-3 pl-1 text-[11px] text-[#ef5454] leading-tight">
                          {err.ticker && <span className="w-20 shrink-0">{err.ticker}</span>}
                          {err.shares && <span className="flex-1">{err.shares}</span>}
                          {err.cost   && <span className="w-24 shrink-0">{err.cost}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add-holding affordance. Free tier is capped at
                  FREE_TIER_POSITION_LIMIT; past that, the button flips to a
                  small upgrade prompt inline. Pro users see the full "+ Add"
                  up to the 10-row hard cap. */}
              {holdings.length < 10 && canAddMore && (
                <button onClick={add} className="self-start text-xs text-[#22B585] hover:underline cursor-pointer">
                  + Add holding
                </button>
              )}
              {!canAddMore && (
                <div className="self-stretch border border-[#22B585]/25 bg-[#22B585]/[0.06] rounded-lg p-2.5 flex items-center gap-2 text-[11.5px] leading-relaxed text-[var(--c-text)]/85 flex-wrap">
                  <span className="text-[#22B585] shrink-0">✦</span>
                  <span className="flex-1 min-w-0">
                    <strong className="text-[var(--c-text-strong)]">Free tier is {FREE_TIER_POSITION_LIMIT} positions.</strong>{' '}
                    Upgrade for unlimited holdings and portfolio-aware AI analysis.
                  </span>
                  <button
                    type="button"
                    onClick={() => { onClose?.(); window.location.assign('/pricing') }}
                    className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.97] text-white font-semibold text-[11.5px] px-3 py-1 rounded-md transition-all duration-150 cursor-pointer whitespace-nowrap"
                  >
                    Upgrade to Pro
                  </button>
                </div>
              )}

              {error && <p className="text-xs text-[#ef5454]">{error}</p>}

              <button
                onClick={analyze}
                disabled={!canSubmit}
                title={
                  loading        ? undefined
                  : anyRowError  ? 'Fix the errors above first'
                  : !completedRows ? 'Enter at least one ticker and share count'
                  : undefined
                }
                className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
              >
                {loading ? 'Fetching prices…' : 'Analyze Portfolio'}
              </button>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Scorecard — Total Value / Total Gain-Loss / Health Score.
                  Total Gain/Loss appears only when at least one position
                  has a cost basis (so a "—" never shows up in the money
                  column). Falls back to 2-column grid otherwise. */}
              <div className={`grid ${result.totalGainLoss != null ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                <div className="glass-card rounded-xl p-4 flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Total Value</span>
                  <span className="text-xl font-black tabular-nums text-[var(--c-text)]">{fmtMoney(result.total)}</span>
                  <span className={`text-xs font-bold tabular-nums ${result.weightedChangePct >= 0 ? 'text-[#22B585]' : 'text-[#ef5454]'}`}>
                    {result.weightedChangePct >= 0 ? '+' : ''}{result.weightedChangePct.toFixed(2)}% today
                  </span>
                </div>

                {result.totalGainLoss != null && (
                  <div className="glass-card rounded-xl p-4 flex flex-col gap-1.5">
                    <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Total Gain/Loss</span>
                    <span
                      className={`text-xl font-black tabular-nums ${result.totalGainLoss >= 0 ? 'text-[#22B585]' : 'text-[#ef5454]'}`}
                    >
                      {result.totalGainLoss >= 0 ? '+' : '−'}{fmtMoney(Math.abs(result.totalGainLoss))}
                    </span>
                    <span
                      className={`text-xs font-bold tabular-nums ${result.totalGainLoss >= 0 ? 'text-[#22B585]' : 'text-[#ef5454]'}`}
                    >
                      {result.totalGainLossPct >= 0 ? '+' : ''}{result.totalGainLossPct.toFixed(2)}% vs cost
                    </span>
                  </div>
                )}

                <div className="glass-card rounded-xl p-4 flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Health Score</span>
                  <span className="text-xl font-black tabular-nums text-[var(--c-text)]">{result.healthScore}<span className="text-sm text-[var(--c-text-faint)] font-normal">/100</span></span>
                  <div className="h-1 bg-[var(--c-chip-bg)] rounded-full overflow-hidden">
                    <div className="h-full bg-[#22B585] rounded-full animate-bar" style={{ width: `${result.healthScore}%` }} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-widest"
                  style={{ color: result.riskColor, borderColor: `${result.riskColor}40`, backgroundColor: `${result.riskColor}15` }}
                >
                  {result.riskLevel} Risk
                </span>
                <span className="text-[10px] text-[var(--c-text-faint)]">·</span>
                <span className="text-[10px] text-[var(--c-text-faint)]">{result.items.length} position{result.items.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Performance chart */}
              {userId && (
                <div className="glass-card rounded-xl p-4">
                  <PortfolioChart snapshots={snapshots} />
                </div>
              )}

              {/* Holdings breakdown */}
              <div>
                <p className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest mb-3">Holdings</p>
                {result.items.sort((a, b) => b.value - a.value).map(h => (
                  <HoldingRow key={h.ticker} h={h} />
                ))}
              </div>

              {/* AI Health Report — Pro-only. Free tier sees a locked
                  placeholder with an inline upgrade CTA; button is not just
                  disabled, it's replaced so it never fires. */}
              <div className="border-t border-[var(--c-border)] pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">AI Health Report</p>
                  {isPro && aiReport && aiReport !== 'loading' && (
                    <button
                      onClick={runAIAnalysis}
                      className="text-[10px] text-[var(--c-text-faint)] hover:text-[#22B585] transition-colors"
                    >
                      Refresh
                    </button>
                  )}
                </div>

                {!isPro && (
                  <div className="border border-[#22B585]/25 bg-[#22B585]/[0.06] rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#22B585]/12 text-[#22B585] border border-[#22B585]/30 uppercase tracking-widest">
                        Pro
                      </span>
                      <span className="text-[13px] font-semibold text-[var(--c-text-strong)]">
                        Portfolio-aware AI reasoning
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[var(--c-text)]/85 leading-relaxed">
                      Get concentration risk, sector exposure, correlation warnings, per-position ADD/HOLD/TRIM/EXIT signals, and a rebalance idea grounded in your exact holdings.
                    </p>
                    <button
                      type="button"
                      onClick={() => { onClose?.(); window.location.assign('/pricing') }}
                      className="self-start bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.97] text-white font-semibold text-[12.5px] px-4 py-1.5 rounded-lg transition-all duration-150 cursor-pointer"
                    >
                      Upgrade to Pro
                    </button>
                  </div>
                )}

                {isPro && !aiReport && aiReport !== 'loading' && (
                  <button
                    onClick={runAIAnalysis}
                    className="flex items-center justify-center gap-2 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] hover:border-[#22B585]/40 rounded-xl px-4 py-3 transition-all duration-150 group"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#22B585]">
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span className="text-xs font-semibold text-[var(--c-text-faint)] group-hover:text-[var(--c-text)] transition-colors">
                      Get AI Health Report
                    </span>
                  </button>
                )}

                {isPro && aiReport === 'loading' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 py-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22B585] animate-pulse" />
                      <span className="text-xs text-[var(--c-text-faint)]">Analyzing your portfolio…</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="h-16 rounded-xl shimmer" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-24 rounded-xl shimmer" />
                        <div className="h-24 rounded-xl shimmer" />
                      </div>
                      <div className="h-28 rounded-xl shimmer" />
                    </div>
                  </div>
                )}

                {isPro && aiError && <p className="text-xs text-[#ef5454]">{aiError}</p>}

                {isPro && aiReport && aiReport !== 'loading' && (
                  <PortfolioAIReport
                    report={aiReport}
                    onAnalyzeTicker={ticker => { onClose(); onAnalyze(ticker) }}
                  />
                )}
              </div>

              {/* Deep analysis shortcuts */}
              <div className="flex flex-col gap-2">
                <p className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Full Chart Analysis</p>
                <div className="flex flex-wrap gap-2">
                  {result.items.map(h => (
                    <button
                      key={h.ticker}
                      onClick={() => { onClose(); onAnalyze(h.ticker) }}
                      className="text-xs font-bold px-3 py-1.5 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg text-[var(--c-text-faint)] hover:border-[#22B585]/40 hover:text-[#22B585] transition-all duration-150"
                    >
                      {h.ticker} →
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={reset} className="self-start text-xs text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors">
                ← Edit holdings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
