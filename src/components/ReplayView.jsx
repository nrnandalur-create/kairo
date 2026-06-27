import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchUserHistory } from '../services/verdictHistory'

const VERDICT_COLOR = { BUY: '#22B585', HOLD: '#e3a234', SELL: '#ef5454' }
const VERDICT_GLYPH = { BUY: '▲', HOLD: '─', SELL: '▼' }

// Replay Mode — chronological timeline of Kairo's verdicts on the current
// ticker for the signed-in user. Sparse today; deepens over time. Shows
// forward outcomes (5d/30d/90d) as the evaluate-verdicts cron backfills them.
//
// Click any row to see indicator + forward-outcome details inline.
export default function ReplayView({ open, onClose, userId, ticker }) {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (!open || !userId || !ticker) return
    setLoading(true)
    fetchUserHistory({ userId, ticker, limit: 100 })
      .then(setRows)
      .finally(() => setLoading(false))
  }, [open, userId, ticker])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reverse so newest is at top.
  const sorted = useMemo(() => [...rows].reverse(), [rows])
  const selected = useMemo(() => rows.find(r => r.id === selectedId), [rows, selectedId])

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
        aria-label="Replay Mode"
        className="glass-strong relative w-full max-w-[640px] rounded-2xl overflow-hidden animate-enter origin-top flex flex-col"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-glass-border)]">
          <div className="flex items-baseline gap-3">
            <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-strong)]">Replay</span>
            {ticker && (
              <span className="font-mono text-[12px] font-black tracking-[0.06em] text-[var(--c-text-faint)]">{ticker}</span>
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

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
          {!userId && <p className="text-sm text-[var(--c-text-faint)]">Sign in to replay your view history.</p>}
          {!ticker  && <p className="text-sm text-[var(--c-text-faint)]">Open a ticker first.</p>}
          {userId && ticker && loading && <p className="text-sm text-[var(--c-text-faint)]">Loading replay…</p>}

          {userId && ticker && !loading && sorted.length === 0 && (
            <div className="flex flex-col items-center text-center gap-2 py-8">
              <p className="text-sm font-semibold text-[var(--c-text-faint)]">No replay data yet</p>
              <p className="text-xs text-[var(--c-text-fainter)] max-w-[340px] leading-relaxed">
                Kairo logs every time you analyze {ticker}. This timeline fills in across visits, and forward-return outcomes (5d / 30d / 90d) backfill nightly.
              </p>
            </div>
          )}

          {sorted.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {sorted.map(r => {
                const isSel = r.id === selectedId
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(isSel ? null : r.id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors tabular-nums cursor-pointer ${
                        isSel
                          ? 'border-[#22B585]/40 bg-[#22B585]/5'
                          : 'border-[var(--c-border)] bg-[var(--c-card)] hover:border-[var(--c-border-strong)]'
                      }`}
                    >
                      <span className="text-[11px] font-mono text-[var(--c-text-fainter)] w-28 shrink-0">
                        {new Date(r.viewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span
                        className="text-[12px] font-bold inline-flex items-center gap-1.5 w-20"
                        style={{ color: VERDICT_COLOR[r.verdict] ?? 'var(--c-text-faint)' }}
                      >
                        {VERDICT_GLYPH[r.verdict]} {r.verdict}
                      </span>
                      <span className="text-[12px] text-[var(--c-text-faint)] w-16">{r.confidence}%</span>
                      <span className="text-[12px] text-[var(--c-text)] ml-auto">${Number(r.price).toFixed(2)}</span>
                    </button>

                    {/* Expanded detail */}
                    {isSel && selected && (
                      <div className="ml-3 mt-1.5 mb-2 px-4 py-3 rounded-lg bg-[var(--c-input-bg)] flex flex-col gap-2 animate-fade">
                        {selected.summary && (
                          <p className="text-[12.5px] text-[var(--c-text)]/90 leading-relaxed italic">"{selected.summary}"</p>
                        )}
                        <div className="grid grid-cols-3 gap-3 pt-1">
                          {selected.rsi != null && (
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--c-text-faint)]">RSI</span>
                              <span className="text-[13px] font-bold tabular-nums text-[var(--c-text)]">{Number(selected.rsi).toFixed(1)}</span>
                            </div>
                          )}
                          {selected.bb_position != null && (
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--c-text-faint)]">BB pos</span>
                              <span className="text-[13px] font-bold tabular-nums text-[var(--c-text)]">{Number(selected.bb_position).toFixed(2)}</span>
                            </div>
                          )}
                          {selected.risk_level && (
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--c-text-faint)]">Risk</span>
                              <span className="text-[13px] font-bold text-[var(--c-text)]">{selected.risk_level}</span>
                            </div>
                          )}
                        </div>
                        {/* Forward outcomes — show only if evaluated */}
                        {(selected.price_at_5d != null || selected.price_at_30d != null || selected.price_at_90d != null) && (
                          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--c-border)]">
                            {[
                              { label: 'Forward 5d',  v: selected.price_at_5d },
                              { label: 'Forward 30d', v: selected.price_at_30d },
                              { label: 'Forward 90d', v: selected.price_at_90d },
                            ].map(({ label, v }) => {
                              if (v == null) {
                                return (
                                  <div key={label} className="flex flex-col">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--c-text-faint)]">{label}</span>
                                    <span className="text-[11px] text-[var(--c-text-fainter)]">pending</span>
                                  </div>
                                )
                              }
                              const ret = ((Number(v) - Number(selected.price)) / Number(selected.price)) * 100
                              return (
                                <div key={label} className="flex flex-col">
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--c-text-faint)]">{label}</span>
                                  <span
                                    className="text-[13px] font-bold tabular-nums"
                                    style={{ color: ret >= 0 ? '#22B585' : '#ef5454' }}
                                  >
                                    {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
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
