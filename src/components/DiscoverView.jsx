import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const KIND_TONE = {
  'Strong day':           { color: '#22B585', glyph: '▲' },
  'Oversold candidate':   { color: '#e3a234', glyph: '↻' },
  'Gap setup':            { color: '#22B585', glyph: '↗' },
  'Relative strength':    { color: '#22B585', glyph: '✦' },
}

export default function DiscoverView({ open, onClose, onSelectTicker }) {
  const [setups, setSetups]   = useState([])
  const [date,   setDate]     = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch('/api/insights?kind=setups')
      .then(r => r.json())
      .then(json => { setSetups(json.setups ?? []); setDate(json.date) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const dateLabel = date
    ? new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    : null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4 animate-fade"
      style={{ background: 'var(--c-overlay)' }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="The Setup Feed"
        className="glass-strong relative w-full max-w-[680px] rounded-2xl overflow-hidden animate-enter origin-top flex flex-col"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-glass-border)]">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-strong)]">Today's setups</span>
            {dateLabel && (
              <span className="text-[10px] font-mono text-[var(--c-text-fainter)]">· {dateLabel}</span>
            )}
          </div>
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

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && <p className="text-sm text-[var(--c-text-faint)]">Loading setups…</p>}

          {!loading && setups.length === 0 && (
            <div className="flex flex-col items-center text-center gap-2 py-8">
              <p className="text-sm font-semibold text-[var(--c-text-faint)]">No setups today</p>
              <p className="text-xs text-[var(--c-text-fainter)] max-w-[320px] leading-relaxed">
                Kairo curates a fresh list every market morning. The next batch arrives at the open.
              </p>
            </div>
          )}

          {!loading && setups.length > 0 && (
            <ul className="flex flex-col gap-3">
              {setups.map((s, i) => {
                const tone = KIND_TONE[s.kind] || { color: '#22B585', glyph: '◆' }
                const up = (s.change_pct ?? 0) >= 0
                return (
                  <li
                    key={i}
                    className="group flex flex-col gap-2 p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-border-strong)] transition-colors cursor-pointer"
                    onClick={() => { onSelectTicker?.(s.ticker); onClose?.() }}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[13px] font-black tracking-[0.06em] text-[var(--c-text-strong)]">{s.ticker}</span>
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border inline-flex items-center gap-1"
                          style={{ color: tone.color, borderColor: tone.color + '4d', background: tone.color + '14' }}
                        >
                          <span aria-hidden="true">{tone.glyph}</span> {s.kind}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 tabular-nums">
                        {s.price != null && <span className="text-[12px] text-[var(--c-text-faint)]">${Number(s.price).toFixed(2)}</span>}
                        {s.change_pct != null && (
                          <span className="text-[12px] font-bold" style={{ color: up ? '#22B585' : '#ef5454' }}>
                            {up ? '+' : ''}{Number(s.change_pct).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[13px] text-[var(--c-text)] leading-relaxed">{s.thesis}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
