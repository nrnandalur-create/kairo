import { useState, useEffect } from 'react'
import { toast } from '../utils/toast'

// Per-row form validation. Empty rows are tolerated (so the user can scaffold).
// Once either field has content, both must be present and valid.
function validateRow({ ticker, shares }) {
  const t = (ticker ?? '').trim()
  const s = (shares ?? '').toString().trim()
  const errors = { ticker: null, shares: null }
  if (t && !/^[A-Z]{1,5}$/.test(t)) errors.ticker = '1–5 letters'
  if (s && (!Number.isFinite(+s) || +s <= 0)) errors.shares = 'Must be > 0'
  if (t && !s) errors.shares = 'Required'
  if (!t && s) errors.ticker = 'Required'
  return errors
}
import { usePortfolio } from '../hooks/usePortfolio'
import PortfolioChart from './PortfolioChart'
import PortfolioAIReport from './PortfolioAIReport'

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—'
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`
}

function calcPortfolio(holdings, quotes) {
  const items = holdings.map(h => {
    const q     = quotes.find(x => x.symbol === h.ticker.toUpperCase())
    const price = q?.price ?? null
    const value = price != null ? price * +h.shares : null
    const chPct = q?.changePct ?? null
    return { ...h, ticker: h.ticker.toUpperCase(), price, changePct: chPct, value }
  }).filter(h => h.value != null)

  const total     = items.reduce((s, h) => s + h.value, 0)
  const withWeight = items.map(h => ({ ...h, weight: total ? h.value / total : 0 }))

  const weightedChangePct = withWeight.reduce((s, h) => s + h.weight * (h.changePct ?? 0), 0)
  const todayPnL          = total * weightedChangePct / 100

  const healthScore = Math.round(Math.max(0, Math.min(100, 50 + weightedChangePct * 5)))

  const maxWeight = Math.max(...withWeight.map(h => h.weight))
  const riskLevel = maxWeight > 0.4 || Math.min(...withWeight.map(h => h.changePct ?? 0)) < -5
    ? 'HIGH'
    : maxWeight <= 0.2 && weightedChangePct >= 0
    ? 'LOW'
    : 'MEDIUM'

  const riskColors = { LOW: '#1D9E75', MEDIUM: '#d4922a', HIGH: '#e24b4a' }

  return { items: withWeight, total, todayPnL, weightedChangePct, healthScore, riskLevel, riskColor: riskColors[riskLevel] }
}

function HoldingRow({ h }) {
  const up     = (h.changePct ?? 0) >= 0
  const signal = (h.changePct ?? 0) >= 1 ? 'Bullish' : (h.changePct ?? 0) <= -1 ? 'Bearish' : 'Neutral'
  const sigCls = signal === 'Bullish'
    ? 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25'
    : signal === 'Bearish'
    ? 'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25'
    : 'bg-[#1a2e1f] text-[var(--c-text-faint)] border-[var(--c-border)]'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0 flex-wrap">
      <span className="text-sm font-bold text-[var(--c-text)] w-14 shrink-0">{h.ticker}</span>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-xs tabular-nums text-[var(--c-text)]">{fmtMoney(h.value)}</span>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--c-text-faint)]">
          <span className="tabular-nums">{Math.round(h.weight * 100)}%</span>
          <span>·</span>
          <span className={`tabular-nums font-semibold ${up ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}`}>
            {up ? '+' : ''}{(h.changePct ?? 0).toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="h-1 flex-1 hidden sm:block bg-[#1a2e1f] rounded-full overflow-hidden">
        <div className="h-full bg-[#1D9E75]/40 rounded-full" style={{ width: `${Math.round(h.weight * 100)}%` }} />
      </div>
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest shrink-0 ${sigCls}`}>
        {signal}
      </span>
    </div>
  )
}

export default function Portfolio({ open, onClose, onAnalyze, userId }) {
  const [holdings,   setHoldings]   = useState([{ ticker: '', shares: '' }])
  const [quotes,     setQuotes]     = useState([])
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState('')
  const [aiReport,   setAiReport]   = useState(null)    // null | 'loading' | object
  const [aiError,    setAiError]    = useState('')

  const { holdings: savedHoldings, snapshots, loading: portfolioLoading, upsertHolding } = usePortfolio(userId)

  // Pre-populate form from Supabase when modal opens (only when not viewing results)
  useEffect(() => {
    if (!open || result || portfolioLoading || savedHoldings.length === 0) return
    setHoldings(savedHoldings.map(h => ({ ticker: h.ticker, shares: String(h.shares) })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, result, savedHoldings, portfolioLoading])

  const update = (i, field, val) =>
    setHoldings(h => h.map((x, idx) => idx === i ? { ...x, [field]: val } : x))

  const add    = () => setHoldings(h => [...h, { ticker: '', shares: '' }])
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
        await Promise.all(valid.map(h => upsertHolding(h.ticker.trim(), h.shares, 0)))
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
    setHoldings([{ ticker: '', shares: '' }])
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
                <div className="bg-[var(--c-bg-deep)] border border-[var(--c-border)] rounded-xl p-4 flex items-start gap-3">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#1D9E75] shrink-0 mt-0.5">
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
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={h.ticker}
                          onChange={e => update(i, 'ticker', e.target.value.toUpperCase())}
                          placeholder="AAPL"
                          maxLength={5}
                          aria-invalid={!!err.ticker}
                          className={`w-24 bg-[var(--c-bg-deep)] border rounded-lg px-3 py-2 text-sm font-bold text-[var(--c-text)] placeholder-[#263d2c] outline-none transition-colors uppercase ${
                            err.ticker
                              ? 'border-[#e24b4a] focus:border-[#e24b4a]'
                              : 'border-[var(--c-border)] focus:border-[#1D9E75]'
                          }`}
                        />
                        <input
                          type="number"
                          value={h.shares}
                          onChange={e => update(i, 'shares', e.target.value)}
                          placeholder="Shares"
                          min="0"
                          aria-invalid={!!err.shares}
                          className={`flex-1 bg-[var(--c-bg-deep)] border rounded-lg px-3 py-2 text-sm text-[var(--c-text)] placeholder-[#263d2c] outline-none transition-colors ${
                            err.shares
                              ? 'border-[#e24b4a] focus:border-[#e24b4a]'
                              : 'border-[var(--c-border)] focus:border-[#1D9E75]'
                          }`}
                        />
                        {holdings.length > 1 && (
                          <button
                            onClick={() => remove(i)}
                            aria-label="Remove holding"
                            title="Remove this holding"
                            className="text-[#263d2c] hover:text-[#e24b4a] transition-colors p-1 shrink-0 cursor-pointer"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      {(err.ticker || err.shares) && (
                        <div className="flex gap-3 pl-1 text-[11px] text-[#e24b4a] leading-tight">
                          {err.ticker && <span className="w-24 shrink-0">{err.ticker}</span>}
                          {err.shares && <span className="flex-1">{err.shares}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {holdings.length < 10 && (
                <button onClick={add} className="self-start text-xs text-[#1D9E75] hover:underline cursor-pointer">
                  + Add holding
                </button>
              )}

              {error && <p className="text-xs text-[#e24b4a]">{error}</p>}

              <button
                onClick={analyze}
                disabled={!canSubmit}
                title={
                  loading        ? undefined
                  : anyRowError  ? 'Fix the errors above first'
                  : !completedRows ? 'Enter at least one ticker and share count'
                  : undefined
                }
                className="bg-[#1D9E75] hover:bg-[#20b382] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
              >
                {loading ? 'Fetching prices…' : 'Analyze Portfolio'}
              </button>
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Scorecard */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card rounded-xl p-4 flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Total Value</span>
                  <span className="text-xl font-black tabular-nums text-[var(--c-text)]">{fmtMoney(result.total)}</span>
                  <span className={`text-xs font-bold tabular-nums ${result.weightedChangePct >= 0 ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}`}>
                    {result.weightedChangePct >= 0 ? '+' : ''}{result.weightedChangePct.toFixed(2)}% today
                  </span>
                </div>

                <div className="glass-card rounded-xl p-4 flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Health Score</span>
                  <span className="text-xl font-black tabular-nums text-[var(--c-text)]">{result.healthScore}<span className="text-sm text-[var(--c-text-faint)] font-normal">/100</span></span>
                  <div className="h-1 bg-[#1a2e1f] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1D9E75] rounded-full animate-bar" style={{ width: `${result.healthScore}%` }} />
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

              {/* AI Health Report */}
              <div className="border-t border-[var(--c-border)] pt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">AI Health Report</p>
                  {aiReport && aiReport !== 'loading' && (
                    <button
                      onClick={runAIAnalysis}
                      className="text-[10px] text-[var(--c-text-faint)] hover:text-[#1D9E75] transition-colors"
                    >
                      Refresh
                    </button>
                  )}
                </div>

                {!aiReport && aiReport !== 'loading' && (
                  <button
                    onClick={runAIAnalysis}
                    className="flex items-center justify-center gap-2 bg-[var(--c-bg-deep)] border border-[var(--c-border)] hover:border-[#1D9E75]/40 rounded-xl px-4 py-3 transition-all duration-150 group"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#1D9E75]">
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span className="text-xs font-semibold text-[var(--c-text-faint)] group-hover:text-[var(--c-text)] transition-colors">
                      Get AI Health Report
                    </span>
                  </button>
                )}

                {aiReport === 'loading' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 py-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
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

                {aiError && <p className="text-xs text-[#e24b4a]">{aiError}</p>}

                {aiReport && aiReport !== 'loading' && (
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
                      className="text-xs font-bold px-3 py-1.5 bg-[var(--c-bg-deep)] border border-[var(--c-border)] rounded-lg text-[var(--c-text-faint)] hover:border-[#1D9E75]/40 hover:text-[#1D9E75] transition-all duration-150"
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
