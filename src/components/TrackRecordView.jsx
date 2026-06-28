import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function Cell({ label, agg }) {
  if (!agg || !agg.count) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{label}</span>
        <span className="text-[13px] text-[var(--c-text-fainter)]">No data yet</span>
      </div>
    )
  }
  const ret = agg.avgReturn
  const hit = agg.hitRate
  const color = ret > 0 ? '#22B585' : ret < 0 ? '#ef5454' : 'var(--c-text)'
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-black tabular-nums" style={{ color }}>
          {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
        </span>
        <span className="text-[10px] text-[var(--c-text-fainter)] tabular-nums">
          {hit.toFixed(0)}% hit · n={agg.count}
        </span>
      </div>
    </div>
  )
}

const VERDICT_COLOR = { BUY: '#22B585', HOLD: '#e3a234', SELL: '#ef5454' }

export default function TrackRecordView({ open, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetch('/api/insights?kind=track-record')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError('Could not load track record'))
      .finally(() => setLoading(false))
  }, [open])

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
        aria-label="The Track Record"
        className="glass-strong relative w-full max-w-[680px] rounded-2xl overflow-hidden animate-enter origin-top flex flex-col"
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-glass-border)]">
          <span className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-strong)]">
            The Track Record · Kairo Receipts
          </span>
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
          {loading && <p className="text-sm text-[var(--c-text-faint)]">Loading receipts…</p>}
          {error && <p className="text-sm text-[#ef5454]">{error}</p>}

          {data && !data.total && (
            <div className="flex flex-col items-center text-center gap-2 py-8">
              <p className="text-sm font-semibold text-[var(--c-text-faint)]">Receipts coming soon</p>
              <p className="text-xs text-[var(--c-text-fainter)] max-w-[360px] leading-relaxed">
                Kairo logs every verdict and scores it against actual price action at 5, 30, and 90 days later. The page fills in as verdicts age — give it a few weeks.
              </p>
            </div>
          )}

          {data?.total > 0 && (
            <>
              <p className="text-[12px] text-[var(--c-text-faint)] leading-relaxed">
                Across <span className="text-[var(--c-text-strong)] font-bold tabular-nums">{data.total.toLocaleString()}</span> logged Kairo verdicts. Hit rate = verdict agreed with the actual move (BUY → up; SELL → down; HOLD → within ±3%).
              </p>

              <section className="flex flex-col gap-2 pt-2 border-t border-[var(--c-border)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#22B585]">Overall</span>
                <div className="grid grid-cols-3 gap-4">
                  <Cell label="5-day"  agg={data.overall?.d5} />
                  <Cell label="30-day" agg={data.overall?.d30} />
                  <Cell label="90-day" agg={data.overall?.d90} />
                </div>
              </section>

              <section className="flex flex-col gap-3 pt-2 border-t border-[var(--c-border)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#22B585]">By verdict</span>
                {['BUY', 'HOLD', 'SELL'].map(v => (
                  <div key={v} className="flex flex-col gap-1.5 p-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-card)]">
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: VERDICT_COLOR[v] }}>{v}</span>
                    <div className="grid grid-cols-3 gap-4">
                      <Cell label="5-day"  agg={data.byVerdict?.[v]?.d5} />
                      <Cell label="30-day" agg={data.byVerdict?.[v]?.d30} />
                      <Cell label="90-day" agg={data.byVerdict?.[v]?.d90} />
                    </div>
                  </div>
                ))}
              </section>

              <section className="flex flex-col gap-2 pt-2 border-t border-[var(--c-border)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#22B585]">30-day return by AI confidence bucket</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(data.byConfidenceBucket ?? {}).map(([bucket, vals]) => (
                    <Cell key={bucket} label={bucket} agg={vals?.d30} />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
