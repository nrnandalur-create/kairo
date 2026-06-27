import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ensureBalance, fetchAllTrades, executeTrade, computeHoldings } from '../services/paperPit'
import { fetchWatchlistQuotes } from '../services/watchlistQuotes'
import { toast } from '../utils/toast'

const GRADE_COLOR = {
  'A':  '#22B585', 'A-': '#22B585',
  'B+': '#22B585', 'B':  '#e3a234', 'B-': '#e3a234',
  'C+': '#e3a234', 'C':  '#e3a234',
  'D':  '#ef5454', 'F':  '#ef5454',
}

export default function PaperPitView({
  open, onClose,
  userId,
  // Optional context for quick-trading the currently-viewed ticker
  currentTicker, currentPrice, aiData,
  onSelectTicker,
}) {
  const [balance, setBalance] = useState(null)
  const [trades,  setTrades]  = useState([])
  const [quotes,  setQuotes]  = useState([])
  const [side,    setSide]    = useState('buy')
  const [shares,  setShares]  = useState('')
  const [working, setWorking] = useState(false)

  const reload = async () => {
    if (!userId) return
    const [bal, ts] = await Promise.all([ensureBalance(userId), fetchAllTrades({ userId })])
    setBalance(bal)
    setTrades(ts)
  }

  useEffect(() => {
    if (!open) return
    reload()
    setSide('buy')
    setShares('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId])

  const holdings = useMemo(() => computeHoldings(trades), [trades])

  // Quote-refresh for current value calculation.
  useEffect(() => {
    if (!open || !holdings.length) return
    fetchWatchlistQuotes(holdings.map(h => h.ticker)).then(setQuotes)
    const id = setInterval(() => fetchWatchlistQuotes(holdings.map(h => h.ticker)).then(setQuotes), 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, holdings.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleExecute = async () => {
    if (!currentTicker || !currentPrice) {
      toast.error('Open a ticker first so we have a price to fill at.')
      return
    }
    const n = parseFloat(shares)
    if (!(n > 0)) { toast.error('Enter a positive share count'); return }
    setWorking(true)
    const r = await executeTrade({
      userId, ticker: currentTicker, side, shares: n,
      currentPrice, aiData,
    })
    setWorking(false)
    if (r.error) { toast.error(r.error); return }
    setShares('')
    toast.success(`${side === 'buy' ? 'Bought' : 'Sold'} ${n} ${currentTicker} (Grade ${r.trade.grade})`)
    reload()
  }

  if (!open) return null

  const holdingValue = holdings.reduce((s, h) => {
    const px = quotes.find(q => q.symbol === h.ticker)?.price ?? h.avgCost
    return s + h.shares * px
  }, 0)
  const totalValue = (balance?.cash ?? 0) + holdingValue
  const totalPnL   = totalValue - 25_000
  const totalPct   = (totalPnL / 25_000) * 100

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[6vh] px-4 animate-fade"
      style={{ background: 'var(--c-overlay)' }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="The Paper Pit"
        className="glass-strong relative w-full max-w-[760px] rounded-2xl overflow-hidden animate-enter origin-top flex flex-col"
        style={{ maxHeight: '88vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-glass-border)]">
          <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-strong)]">The Paper Pit · Practice with AI grading</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors p-1 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {!userId && <p className="text-sm text-[var(--c-text-faint)]">Sign in to practice with virtual capital.</p>}

          {userId && (
            <>
              {/* Top summary */}
              <div className="grid grid-cols-3 gap-4 pt-1">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Cash</span>
                  <span className="text-base font-black tabular-nums text-[var(--c-text-strong)]">
                    ${(balance?.cash ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Portfolio Value</span>
                  <span className="text-base font-black tabular-nums text-[var(--c-text-strong)]">
                    ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">Total P/L</span>
                  <span
                    className="text-base font-black tabular-nums"
                    style={{ color: totalPnL >= 0 ? '#22B585' : '#ef5454' }}
                  >
                    {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)} ({totalPct.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Trade form */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--c-border)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Trade now</span>
                {!currentTicker ? (
                  <p className="text-[12px] text-[var(--c-text-fainter)]">Open a ticker's analysis page first to fill at its current price.</p>
                ) : (
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase text-[var(--c-text-faint)]">Ticker</span>
                      <span className="font-mono text-[14px] font-black text-[var(--c-text-strong)] tracking-[0.06em]">{currentTicker}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg p-0.5">
                      {['buy', 'sell'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSide(s)}
                          className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-md transition-colors cursor-pointer ${
                            side === s
                              ? s === 'buy' ? 'bg-[#22B585] text-white' : 'bg-[#ef5454] text-white'
                              : 'text-[var(--c-text-faint)] hover:text-[var(--c-text)]'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase text-[var(--c-text-faint)]" htmlFor="paper-shares">Shares</label>
                      <input
                        id="paper-shares"
                        type="number"
                        min="0"
                        step="0.01"
                        value={shares}
                        onChange={(e) => setShares(e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        className="w-24 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors tabular-nums"
                      />
                    </div>
                    <span className="text-[11px] text-[var(--c-text-fainter)] tabular-nums">
                      @ ${currentPrice?.toFixed(2) ?? '—'}
                    </span>
                    <button
                      type="button"
                      onClick={handleExecute}
                      disabled={working || !parseFloat(shares)}
                      className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-white ${
                        side === 'buy' ? 'bg-[#22B585] hover:bg-[#2BC093]' : 'bg-[#ef5454] hover:bg-[#ef6a6a]'
                      }`}
                    >
                      Execute
                    </button>
                  </div>
                )}
              </div>

              {/* Holdings */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--c-border)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Open positions</span>
                {holdings.length === 0 ? (
                  <p className="text-[12px] text-[var(--c-text-fainter)]">No paper positions yet. Open a ticker and execute your first practice trade.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {holdings.map(h => {
                      const q = quotes.find(x => x.symbol === h.ticker)
                      const px = q?.price ?? h.avgCost
                      const pnl = (px - h.avgCost) * h.shares
                      const pct = ((px - h.avgCost) / h.avgCost) * 100
                      return (
                        <li
                          key={h.ticker}
                          className="flex items-center gap-3 text-[13px] py-1.5 px-3 rounded-lg hover:bg-[var(--c-hover-bg)] cursor-pointer tabular-nums"
                          onClick={() => { onSelectTicker?.(h.ticker); onClose?.() }}
                        >
                          <span className="font-mono text-[12px] font-bold w-14 text-[var(--c-text-strong)]">{h.ticker}</span>
                          <span className="text-[var(--c-text-faint)] w-20">{h.shares.toFixed(2)} sh</span>
                          <span className="text-[var(--c-text-faint)] w-24">@ ${h.avgCost.toFixed(2)}</span>
                          <span className="text-[var(--c-text)] w-24">${px.toFixed(2)}</span>
                          <span className="ml-auto font-bold" style={{ color: pnl >= 0 ? '#22B585' : '#ef5454' }}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({pct.toFixed(2)}%)
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Trade history */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[var(--c-border)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Trade history</span>
                {trades.length === 0 ? (
                  <p className="text-[12px] text-[var(--c-text-fainter)]">No trades yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {trades.slice(0, 20).map(t => (
                      <li key={t.id} className="flex items-center gap-2 text-[12.5px] tabular-nums py-1">
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            color: t.side === 'buy' ? '#22B585' : '#ef5454',
                            background: (t.side === 'buy' ? 'rgba(34,181,133,0.12)' : 'rgba(239,84,84,0.12)'),
                          }}
                        >
                          {t.side}
                        </span>
                        <span className="font-mono font-bold w-14">{t.ticker}</span>
                        <span className="text-[var(--c-text-faint)]">{Number(t.shares).toFixed(2)} @ ${Number(t.fill_price).toFixed(2)}</span>
                        {t.grade && (
                          <span
                            className="text-[10px] font-bold ml-auto px-1.5 py-0.5 rounded border"
                            title={t.grade_reason ?? ''}
                            style={{
                              color: GRADE_COLOR[t.grade] || 'var(--c-text-faint)',
                              borderColor: (GRADE_COLOR[t.grade] || 'var(--c-border)') + '4d',
                            }}
                          >
                            {t.grade}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
