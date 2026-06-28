import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchWatchlistQuotes } from '../services/watchlistQuotes'
import { supabase } from '../lib/supabase'

const FUTURES = ['SPY', 'QQQ', 'IWM']
const REFRESH_MS = 30_000

// Small helper for the index ticker. Same call shape as fetchWatchlistQuotes.
async function fetchFutures() {
  try {
    return await fetchWatchlistQuotes(FUTURES)
  } catch { return [] }
}

async function fetchPulseNarration({ quotes, macros }) {
  try {
    const r = await fetch('/api/market-pulse?action=narrate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ quotes, macros }),
    })
    if (!r.ok) return null
    const json = await r.json()
    return json.narration ?? null
  } catch { return null }
}

async function fetchRecentSignals({ userId, sinceMs = 60 * 60_000 }) {
  if (!userId) return []
  try {
    const cutoff = new Date(Date.now() - sinceMs).toISOString()
    const { data, error } = await supabase
      .from('verdict_history')
      .select('id, ticker, verdict, confidence, price, viewed_at')
      .eq('user_id', userId)
      .gte('viewed_at', cutoff)
      .order('viewed_at', { ascending: false })
      .limit(10)
    if (error) return []
    return data ?? []
  } catch { return [] }
}

function MoverTile({ q, onSelect }) {
  if (!q) return null
  const pct = q.changePct
  const up  = pct != null && pct >= 0
  const color = pct == null ? 'var(--c-text-faint)' : up ? '#22B585' : '#ef5454'
  return (
    <button
      type="button"
      onClick={() => onSelect?.(q.symbol)}
      className="flex flex-col gap-1 px-4 py-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-border-strong)] transition-colors cursor-pointer text-left min-w-[140px]"
    >
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{q.symbol}</span>
      <span className="text-base font-black tabular-nums text-[var(--c-text)]">
        {q.price != null ? `$${Number(q.price).toFixed(2)}` : '—'}
      </span>
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
        {pct == null ? '—' : `${up ? '+' : ''}${pct.toFixed(2)}%`}
      </span>
    </button>
  )
}

const VERDICT_COLOR = { BUY: '#22B585', HOLD: '#e3a234', SELL: '#ef5454' }
const VERDICT_GLYPH = { BUY: '▲',       HOLD: '─',      SELL: '▼' }

export default function PulseView({ open, onClose, watchlistTickers = [], userId, onSelectTicker }) {
  const [quotes, setQuotes]       = useState([])
  const [macros, setMacros]       = useState([])
  const [narration, setNarration] = useState(null)
  const [signals, setSignals]     = useState([])
  const [refreshedAt, setRefreshedAt] = useState(null)
  const inFlight = useRef(false)

  const refresh = async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const [wl, mk, sg] = await Promise.all([
        watchlistTickers.length ? fetchWatchlistQuotes(watchlistTickers) : Promise.resolve([]),
        fetchFutures(),
        fetchRecentSignals({ userId }),
      ])
      setQuotes(wl)
      setMacros(mk)
      setSignals(sg)
      setRefreshedAt(Date.now())
      // Narration is rate-limited — only refresh on open + every 5 min, not 30s.
      if (!narration && wl.length) {
        const n = await fetchPulseNarration({ quotes: wl, macros: mk })
        if (n) setNarration(n)
      }
    } finally { inFlight.current = false }
  }

  // Refresh on open, then every REFRESH_MS while open. Pause when modal is closed.
  useEffect(() => {
    if (!open) return
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, watchlistTickers.join(','), userId])

  // Refresh narration on a slower cadence (5 min while open).
  useEffect(() => {
    if (!open) return
    const id = setInterval(async () => {
      if (!quotes.length) return
      const n = await fetchPulseNarration({ quotes, macros })
      if (n) setNarration(n)
    }, 5 * 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ESC closes
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Derived: aggregate watchlist index.
  const wlSummary = useMemo(() => {
    const valid = quotes.filter(q => q && q.changePct != null)
    if (!valid.length) return null
    const avg     = valid.reduce((s, q) => s + q.changePct, 0) / valid.length
    const greens  = valid.filter(q => q.changePct >= 0).length
    const sorted  = [...valid].sort((a, b) => b.changePct - a.changePct)
    const leader  = sorted[0]
    const laggard = sorted[sorted.length - 1]
    const spy     = macros.find(m => m.symbol === 'SPY')?.changePct ?? null
    return { avg, greens, total: valid.length, leader, laggard, spy }
  }, [quotes, macros])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4 animate-fade"
      style={{ background: 'var(--c-overlay)' }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="The Pulse — live intraday dashboard"
        className="glass-strong relative w-full max-w-[820px] rounded-2xl overflow-hidden animate-enter origin-top flex flex-col"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-glass-border)]">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-strong)]">The Pulse</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-[#22B585]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22B585] animate-pulse" />
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-3">
            {refreshedAt && (
              <span className="text-[10px] font-mono text-[var(--c-text-fainter)] tabular-nums">
                {new Date(refreshedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* Empty state */}
          {!watchlistTickers.length && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm font-semibold text-[var(--c-text-faint)]">No watchlist yet</p>
              <p className="text-xs text-[var(--c-text-fainter)] max-w-[280px] leading-relaxed">
                Bookmark some tickers from any analysis page to see them stream here live.
              </p>
            </div>
          )}

          {/* Watchlist-as-index summary */}
          {wlSummary && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Your watchlist as an index</span>
              <p className="text-[15px] leading-snug text-[var(--c-text)]">
                <span className="font-black tabular-nums" style={{ color: wlSummary.avg >= 0 ? '#22B585' : '#ef5454' }}>
                  {wlSummary.avg >= 0 ? '+' : ''}{wlSummary.avg.toFixed(2)}%
                </span>
                {' '}across {wlSummary.total} names ({wlSummary.greens} green){wlSummary.spy != null && (
                  <>, {wlSummary.avg >= wlSummary.spy ? 'beating' : 'lagging'} SPY ({wlSummary.spy >= 0 ? '+' : ''}{wlSummary.spy.toFixed(2)}%)</>
                )}
                . Leader: <span className="font-bold">{wlSummary.leader.symbol}</span> {wlSummary.leader.changePct >= 0 ? '+' : ''}{wlSummary.leader.changePct.toFixed(2)}%.
                {wlSummary.laggard.symbol !== wlSummary.leader.symbol && (
                  <> Laggard: <span className="font-bold">{wlSummary.laggard.symbol}</span> {wlSummary.laggard.changePct >= 0 ? '+' : ''}{wlSummary.laggard.changePct.toFixed(2)}%.</>
                )}
              </p>
              {narration && (
                <p className="text-[12.5px] text-[var(--c-text-faint)] italic leading-relaxed border-l-2 border-[#22B585]/40 pl-3 mt-1">
                  {narration}
                </p>
              )}
            </div>
          )}

          {/* Mover grid */}
          {quotes.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Live movers</span>
              <div className="flex flex-wrap gap-2">
                {quotes
                  .slice()
                  .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
                  .map(q => <MoverTile key={q.symbol} q={q} onSelect={onSelectTicker} />)}
              </div>
            </div>
          )}

          {/* Active signals */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Recent signals (last 60 min)</span>
            {signals.length === 0 ? (
              <p className="text-[12px] text-[var(--c-text-fainter)]">No verdicts logged in the last hour.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {signals.map(s => (
                  <li key={s.id} className="flex items-center gap-3 text-[13px] py-1.5 px-3 rounded-lg hover:bg-[var(--c-hover-bg)] cursor-pointer" onClick={() => onSelectTicker?.(s.ticker)}>
                    <span className="font-mono text-[12px] font-bold w-12 text-[var(--c-text-strong)]">{s.ticker}</span>
                    <span className="font-bold inline-flex items-center gap-1" style={{ color: VERDICT_COLOR[s.verdict] }}>
                      {VERDICT_GLYPH[s.verdict]} {s.verdict}
                    </span>
                    <span className="text-[var(--c-text-faint)] tabular-nums">{s.confidence}%</span>
                    <span className="text-[var(--c-text-fainter)] ml-auto text-[11px] font-mono">
                      {new Date(s.viewed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
