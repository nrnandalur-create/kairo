import { useState, useEffect } from 'react'
import { usePortfolio } from '../hooks/usePortfolio'

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
    : 'bg-[#1a2e1f] text-[#4b6358] border-[#1a2e1f]'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#1a2e1f] last:border-0 flex-wrap">
      <span className="text-sm font-bold text-[#d1d9d5] w-14 shrink-0">{h.ticker}</span>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-xs tabular-nums text-[#d1d9d5]">{fmtMoney(h.value)}</span>
        <div className="flex items-center gap-1.5 text-[10px] text-[#4b6358]">
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
  const [holdings, setHoldings] = useState([{ ticker: '', shares: '' }])
  const [quotes,   setQuotes]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const [error,    setError]    = useState('')

  const { holdings: savedHoldings, loading: portfolioLoading, upsertHolding } = usePortfolio(userId)

  // Pre-populate form from Supabase when modal opens (only when not viewing results)
  useEffect(() => {
    if (!open || result || portfolioLoading || savedHoldings.length === 0) return
    setHoldings(savedHoldings.map(h => ({ ticker: h.ticker, shares: String(h.shares) })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, result, savedHoldings, portfolioLoading])

  const update = (i, field, val) =>
    setHoldings(h => h.map((x, idx) => idx === i ? { ...x, [field]: val } : x))

  const add    = () => setHoldings(h => [...h, { ticker: '', shares: '' }])
  const remove = (i) => setHoldings(h => h.filter((_, idx) => idx !== i))

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
      if (userId) {
        await Promise.all(valid.map(h => upsertHolding(h.ticker.trim(), h.shares, 0)))
      }
    } catch {
      setError('Failed to fetch prices. Check your tickers and try again.')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setHoldings([{ ticker: '', shares: '' }])
    setQuotes([])
    setResult(null)
    setError('')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#080c0a] border border-[#1a2e1f] rounded-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2e1f] shrink-0">
          <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Portfolio Analyzer</span>
          <button onClick={onClose} className="text-[#4b6358] hover:text-[#d1d9d5] transition-colors p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Holdings entry */}
          {!result && (
            <div className="px-6 py-5 flex flex-col gap-4">
              <p className="text-xs text-[#4b6358]">Enter your holdings to get a portfolio health snapshot.</p>

              <div className="flex flex-col gap-2">
                {holdings.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={h.ticker}
                      onChange={e => update(i, 'ticker', e.target.value.toUpperCase())}
                      placeholder="AAPL"
                      maxLength={5}
                      className="w-24 bg-[#0a0f0d] border border-[#1a2e1f] rounded-lg px-3 py-2 text-sm font-bold text-[#d1d9d5] placeholder-[#263d2c] outline-none focus:border-[#1D9E75] transition-colors uppercase"
                    />
                    <input
                      type="number"
                      value={h.shares}
                      onChange={e => update(i, 'shares', e.target.value)}
                      placeholder="Shares"
                      min="0"
                      className="flex-1 bg-[#0a0f0d] border border-[#1a2e1f] rounded-lg px-3 py-2 text-sm text-[#d1d9d5] placeholder-[#263d2c] outline-none focus:border-[#1D9E75] transition-colors"
                    />
                    {holdings.length > 1 && (
                      <button
                        onClick={() => remove(i)}
                        className="text-[#263d2c] hover:text-[#e24b4a] transition-colors p-1 shrink-0"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M10.5 3.5L3.5 10.5M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {holdings.length < 10 && (
                <button
                  onClick={add}
                  className="self-start text-xs text-[#1D9E75] hover:underline"
                >
                  + Add holding
                </button>
              )}

              {error && <p className="text-xs text-[#e24b4a]">{error}</p>}

              <button
                onClick={analyze}
                disabled={loading}
                className="bg-[#1D9E75] hover:bg-[#20b382] active:scale-[0.98] disabled:opacity-40 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
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
                <div className="bg-[#0f1611] border border-[#1a2e1f] rounded-xl p-4 flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[#4b6358] uppercase tracking-widest">Total Value</span>
                  <span className="text-xl font-black tabular-nums text-[#d1d9d5]">{fmtMoney(result.total)}</span>
                  <span className={`text-xs font-bold tabular-nums ${result.weightedChangePct >= 0 ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}`}>
                    {result.weightedChangePct >= 0 ? '+' : ''}{result.weightedChangePct.toFixed(2)}% today
                  </span>
                </div>

                <div className="bg-[#0f1611] border border-[#1a2e1f] rounded-xl p-4 flex flex-col gap-1.5">
                  <span className="text-[9px] font-bold text-[#4b6358] uppercase tracking-widest">Health Score</span>
                  <span className="text-xl font-black tabular-nums text-[#d1d9d5]">{result.healthScore}<span className="text-sm text-[#4b6358] font-normal">/100</span></span>
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
                <span className="text-[10px] text-[#4b6358]">·</span>
                <span className="text-[10px] text-[#4b6358]">{result.items.length} position{result.items.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Holdings breakdown */}
              <div>
                <p className="text-[9px] font-bold text-[#4b6358] uppercase tracking-widest mb-3">Holdings</p>
                {result.items.sort((a, b) => b.value - a.value).map(h => (
                  <HoldingRow key={h.ticker} h={h} />
                ))}
              </div>

              {/* Click to full analysis */}
              <div className="flex flex-col gap-2">
                <p className="text-[9px] font-bold text-[#4b6358] uppercase tracking-widest">Deep Analysis</p>
                <div className="flex flex-wrap gap-2">
                  {result.items.map(h => (
                    <button
                      key={h.ticker}
                      onClick={() => { onClose(); onAnalyze(h.ticker) }}
                      className="text-xs font-bold px-3 py-1.5 bg-[#0a0f0d] border border-[#1a2e1f] rounded-lg text-[#4b6358] hover:border-[#1D9E75]/40 hover:text-[#1D9E75] transition-all duration-150"
                    >
                      {h.ticker} →
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={reset} className="self-start text-xs text-[#4b6358] hover:text-[#d1d9d5] transition-colors">
                ← Edit holdings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
