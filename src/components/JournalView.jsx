import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchAllConvictions } from '../services/convictionLog'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const day  = 86_400_000
  if (diff < day)     return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < day * 7) return `${Math.round(diff / day)}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const VERDICT_COLOR = { BUY: '#22B585', HOLD: '#e3a234', SELL: '#ef5454' }

export default function JournalView({ open, onClose, userId, onSelectTicker }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !userId) return
    setLoading(true)
    fetchAllConvictions({ userId })
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [open, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
        aria-label="The Conviction Log"
        className="glass-strong relative w-full max-w-[640px] rounded-2xl overflow-hidden animate-enter origin-top flex flex-col"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-glass-border)]">
          <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-strong)]">The Conviction Log</span>
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
          {loading ? (
            <p className="text-sm text-[var(--c-text-faint)]">Loading…</p>
          ) : !userId ? (
            <p className="text-sm text-[var(--c-text-faint)]">Sign in to capture and revisit your investment theses.</p>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-2 py-8">
              <p className="text-sm font-semibold text-[var(--c-text-faint)]">No entries yet</p>
              <p className="text-xs text-[var(--c-text-fainter)] max-w-[320px] leading-relaxed">
                When you fill in <span className="font-semibold text-[var(--c-text)]">My Position</span> for a ticker, Kairo asks why — and saves your thesis here. 30 days later, an AI follow-up asks if you still believe it.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {entries.map(e => (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 p-4 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-border-strong)] transition-colors cursor-pointer"
                  onClick={() => { onSelectTicker?.(e.ticker); onClose?.() }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-black tracking-[0.06em] text-[var(--c-text-strong)]">{e.ticker}</span>
                      {e.captured_verdict && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border"
                          style={{
                            color:       VERDICT_COLOR[e.captured_verdict] ?? 'var(--c-text-faint)',
                            borderColor: VERDICT_COLOR[e.captured_verdict] ? VERDICT_COLOR[e.captured_verdict] + '4d' : 'var(--c-border)',
                          }}
                        >
                          Kairo: {e.captured_verdict}{e.captured_confidence != null ? ` ${e.captured_confidence}%` : ''}
                        </span>
                      )}
                      {e.captured_price != null && (
                        <span className="text-[10px] font-mono text-[var(--c-text-fainter)] tabular-nums">@ ${Number(e.captured_price).toFixed(2)}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[var(--c-text-fainter)]">{timeAgo(e.created_at)}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--c-text)]">{e.thesis}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
