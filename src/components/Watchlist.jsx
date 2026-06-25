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

// ── Supabase-backed alert badge ────────────────────────────────────────────────
function AlertBadge({ price, alertPrice, alertDirection }) {
  if (price == null || alertPrice == null || !alertDirection) return null
  if (alertDirection === 'above' && price >= alertPrice)
    return <span className="text-[9px] font-bold text-[#22B585] bg-[#22B585]/10 border border-[#22B585]/25 px-1.5 py-0.5 rounded-full leading-none shrink-0">▲ ALERT</span>
  if (alertDirection === 'below' && price <= alertPrice)
    return <span className="text-[9px] font-bold text-[#ef5454] bg-[#ef5454]/10 border border-[#ef5454]/25 px-1.5 py-0.5 rounded-full leading-none shrink-0">▼ ALERT</span>
  return null
}

// ── Bell icon SVG ──────────────────────────────────────────────────────────────
function BellIcon({ filled }) {
  return filled ? (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5A3.5 3.5 0 003.5 5v3.5L2 10h10l-1.5-1.5V5A3.5 3.5 0 007 1.5z" fill="currentColor"/>
      <path d="M5.5 10.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5A3.5 3.5 0 003.5 5v3.5L2 10h10l-1.5-1.5V5A3.5 3.5 0 007 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5.5 10.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

// ── Bell popover for setting / clearing alerts ─────────────────────────────────
function AlertPopover({ symbol, alertPrice, alertDirection, price, onAlertUpdate }) {
  const [open,     setOpen]    = useState(false)
  const [inputVal, setInputVal] = useState(alertPrice != null ? String(alertPrice) : '')
  const [dir,      setDir]     = useState(alertDirection ?? 'above')
  const ref = useRef(null)

  // Sync fields when Supabase data updates
  useEffect(() => {
    setInputVal(alertPrice != null ? String(alertPrice) : '')
    setDir(alertDirection ?? 'above')
  }, [alertPrice, alertDirection])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const hasAlert = alertPrice != null
  const isTriggered = hasAlert && price != null && (
    (alertDirection === 'above' && price >= alertPrice) ||
    (alertDirection === 'below' && price <= alertPrice)
  )

  const bellColor = isTriggered ? (alertDirection === 'above' ? '#22B585' : '#ef5454')
                  : hasAlert    ? '#e3a234'
                  : undefined

  const handleSave = async e => {
    e.stopPropagation()
    const val = parseFloat(inputVal)
    if (!inputVal || isNaN(val) || val <= 0) return
    await onAlertUpdate(symbol, val, dir)
    setOpen(false)
  }

  const handleClear = async e => {
    e.stopPropagation()
    await onAlertUpdate(symbol, null, null)
    setInputVal('')
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative shrink-0" onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        aria-label={hasAlert ? 'Edit price alert' : 'Set price alert'}
        className={`transition-colors duration-150 ${hasAlert ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ color: bellColor ?? '#263d2c' }}
      >
        <BellIcon filled={hasAlert} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-48 glass-card rounded-xl p-3 z-30 shadow-2xl flex flex-col gap-2.5">
          <p className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Price Alert</p>

          {/* Direction toggle */}
          <div className="flex gap-1">
            {['above', 'below'].map(d => (
              <button
                key={d}
                onClick={e => { e.stopPropagation(); setDir(d) }}
                className={`flex-1 text-[10px] font-bold py-1 rounded-lg border transition-all ${
                  dir === d
                    ? d === 'above'
                      ? 'bg-[#22B585]/10 border-[#22B585]/30 text-[#22B585]'
                      : 'bg-[#ef5454]/10 border-[#ef5454]/30 text-[#ef5454]'
                    : 'bg-transparent border-[var(--c-border)] text-[var(--c-text-faint)] hover:border-[var(--c-border-strong)]'
                }`}
              >
                {d === 'above' ? '▲ Above' : '▼ Below'}
              </button>
            ))}
          </div>

          {/* Price input */}
          <input
            type="number"
            min="0"
            step="0.01"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.key === 'Enter' && handleSave(e)}
            placeholder={price != null ? fmtPrice(price) : 'Price'}
            className="w-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors"
          />

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!inputVal}
              className="flex-1 bg-[#22B585] disabled:opacity-30 hover:bg-[#2BC093] text-white text-[10px] font-bold py-1.5 rounded-lg transition-colors cursor-pointer disabled:cursor-default"
            >
              Set Alert
            </button>
            {hasAlert && (
              <button
                onClick={handleClear}
                className="text-[10px] text-[var(--c-text-faint)] hover:text-[#ef5454] transition-colors shrink-0"
              >
                Clear
              </button>
            )}
          </div>

          {hasAlert && (
            <p className="text-[9px] text-[#263d2c] leading-relaxed">
              Alert when {symbol} goes {alertDirection} ${fmtPrice(alertPrice)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Inline note editor ─────────────────────────────────────────────────────────
function NoteInline({ symbol, note, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(note ?? '')
  const inputRef              = useRef(null)

  useEffect(() => { setDraft(note ?? '') }, [note])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    const trimmed = draft.trim()
    setEditing(false)
    if (trimmed !== (note ?? '')) onSave(symbol, trimmed || null)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setDraft(note ?? ''); setEditing(false) }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onClick={e => e.stopPropagation()}
        maxLength={120}
        placeholder="Add a note…"
        className="w-full text-[10px] text-[#8aab97] bg-[var(--c-input-bg)] border border-[#22B585]/40 rounded px-1.5 py-0.5 outline-none placeholder-[var(--c-input-placeholder)] leading-tight"
      />
    )
  }

  if (note) {
    return (
      <button
        onClick={e => { e.stopPropagation(); setEditing(true) }}
        className="flex items-center gap-1 text-left group/note"
        title="Edit note"
      >
        <span className="text-[10px] text-[var(--c-text-faint)] leading-tight truncate max-w-[120px]">{note}</span>
        <svg className="opacity-0 group-hover/note:opacity-100 shrink-0 transition-opacity" width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M8.5 1.5a1.5 1.5 0 012.12 2.12L3.75 10.5 1 11l.5-2.75 6.94-6.75z" stroke="#4b6358" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className="text-[10px] text-[#263d2c] hover:text-[var(--c-text-faint)] leading-tight opacity-0 group-hover:opacity-100 transition-opacity"
    >
      + note
    </button>
  )
}

// ── Tile ───────────────────────────────────────────────────────────────────────
function WatchlistTile({
  symbol, note, price, changePct, loading,
  alertPrice, alertDirection,
  onSelect, onRemove, onNoteUpdate, onAlertUpdate,
}) {
  const up       = changePct != null && !isNaN(changePct) && changePct >= 0
  const valid    = changePct != null && !isNaN(changePct)
  const pctColor = valid ? (up ? '#22B585' : '#ef5454') : '#4b6358'

  return (
    <div
      className="group relative flex items-center gap-2 glass-card rounded-xl px-4 py-3 hover:border-[var(--c-border-strong)] hover:bg-[var(--c-hover-bg)] transition-all duration-150 cursor-pointer"
      onClick={() => onSelect(symbol)}
    >
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-[var(--c-text)] leading-none">{symbol}</span>
          <AlertBadge price={price} alertPrice={alertPrice} alertDirection={alertDirection} />
        </div>
        {loading && price == null ? (
          <div className="h-3 w-16 rounded-full shimmer mt-0.5" />
        ) : (
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs tabular-nums text-[var(--c-text-faint)] leading-none">${fmtPrice(price)}</span>
            <span className="text-[10px] font-bold tabular-nums leading-none" style={{ color: pctColor }}>
              {fmtPct(changePct)}
            </span>
          </div>
        )}
        <NoteInline symbol={symbol} note={note} onSave={onNoteUpdate} />
      </div>

      {/* Bell alert button — only when user can save to Supabase */}
      {onAlertUpdate && (
        <AlertPopover
          symbol={symbol}
          alertPrice={alertPrice}
          alertDirection={alertDirection}
          price={price}
          onAlertUpdate={onAlertUpdate}
        />
      )}

      {/* Remove button */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(symbol) }}
        aria-label={`Remove ${symbol} from watchlist`}
        className="shrink-0 text-[#263d2c] hover:text-[#ef5454] transition-colors duration-150 opacity-0 group-hover:opacity-100"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

// ── Watchlist ──────────────────────────────────────────────────────────────────
export default function Watchlist({ rows = [], onSelect, onRemove, onNoteUpdate, onAlertUpdate }) {
  const [quotes,  setQuotes]  = useState([])
  const [loading, setLoading] = useState(false)
  const tickers   = rows.map(r => r.ticker)
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

  if (!rows.length) return (
    <div className="w-full flex flex-col gap-3 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">My Watchlist</span>
      <div className="glass-card rounded-xl p-6 flex flex-col items-center gap-2 text-center">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-[#263d2c] mb-1">
          <path d="M4 2.5h12a.5.5 0 01.5.5v15l-6.5-4-6.5 4V3a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
        <p className="text-xs font-semibold text-[var(--c-text-faint)]">Your watchlist is empty</p>
        <p className="text-[11px] text-[#263d2c] max-w-[220px] leading-relaxed">Search for a ticker above, then click the bookmark icon to track it here.</p>
      </div>
    </div>
  )

  const items = rows.map(row => {
    const q = quotes.find(x => x.symbol === row.ticker)
    return {
      symbol:         row.ticker,
      note:           row.note           ?? null,
      alertPrice:     row.alert_price    ?? null,
      alertDirection: row.alert_direction ?? null,
      price:          q?.price           ?? null,
      changePct:      q?.changePct       ?? null,
    }
  })

  return (
    <div className="w-full flex flex-col gap-3 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">My Watchlist</span>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <WatchlistTile
            key={item.symbol}
            {...item}
            loading={loading}
            onSelect={onSelect}
            onRemove={onRemove}
            onNoteUpdate={onNoteUpdate}
            onAlertUpdate={onAlertUpdate}
          />
        ))}
      </div>
    </div>
  )
}
