import { useMemo } from 'react'

const HOUR_LABEL = { amc: 'After Close', bmo: 'Before Open', dmh: 'During Hours' }

function fmtDate(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateShort(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtEps(n) {
  if (n == null || isNaN(n)) return '—'
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0">
      <div className="h-3 w-12 rounded-full shimmer shrink-0" />
      <div className="h-3 w-20 rounded-full shimmer shrink-0" />
      <div className="h-3 w-12 rounded-full shimmer ml-auto" />
      <div className="h-3 w-12 rounded-full shimmer" />
      <div className="h-5 w-10 rounded-full shimmer" />
    </div>
  )
}

export default function EarningsCalendar({ data, loading }) {
  const today = new Date().toISOString().split('T')[0]

  const { next, recent } = useMemo(() => {
    if (!data) return { next: null, recent: [] }
    // data is sorted descending (newest first from API)
    const upcoming = data.filter(e => e.date >= today).reverse() // ascending for next-first
    const past     = data.filter(e => e.date < today).slice(0, 4)
    return { next: upcoming[0] ?? null, recent: past }
  }, [data, today])

  if (!loading && (!data || data.length === 0)) return null

  return (
    <div className="w-full glass-card rounded-2xl p-5 flex flex-col gap-4 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Earnings Calendar</span>

      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="h-[72px] rounded-xl shimmer" />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <>
          {/* Next upcoming earnings */}
          {next ? (
            <div className="bg-[#1D9E75]/5 border border-[#1D9E75]/20 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse shrink-0" />
                <span className="text-[9px] font-bold text-[#1D9E75] uppercase tracking-widest">Next Earnings</span>
              </div>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-sm font-bold text-[var(--c-text)]">Q{next.quarter} {next.year}</span>
                  <span className="text-xs text-[var(--c-text-faint)] ml-2">{fmtDate(next.date)}</span>
                </div>
                {next.hour && (
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#1D9E75]/10 text-[#1D9E75] border border-[#1D9E75]/20 uppercase tracking-widest shrink-0">
                    {HOUR_LABEL[next.hour] ?? next.hour}
                  </span>
                )}
              </div>
              {next.epsEstimate != null && (
                <p className="text-[11px] text-[var(--c-text-faint)]">
                  Est. EPS{' '}
                  <span className="text-[var(--c-text)] font-bold tabular-nums">{fmtEps(next.epsEstimate)}</span>
                  {next.epsLow != null && next.epsHigh != null && (
                    <span className="text-[#263d2c] ml-1 tabular-nums">
                      ({fmtEps(next.epsLow)} – {fmtEps(next.epsHigh)})
                    </span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-[var(--c-border)] rounded-xl px-4 py-3 text-xs text-[var(--c-text-faint)]">
              No upcoming earnings scheduled
            </div>
          )}

          {/* Recent history */}
          {recent.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest mb-1">Recent History</p>
              <div className="flex flex-col">
                {recent.map(e => {
                  const hasBoth = e.epsActual != null && e.epsEstimate != null
                  const beat = hasBoth && e.epsActual > e.epsEstimate
                  const miss = hasBoth && e.epsActual < e.epsEstimate
                  return (
                    <div key={`${e.year}-${e.quarter}`} className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0 flex-wrap">
                      <span className="text-[10px] font-bold text-[var(--c-text-faint)] w-12 shrink-0 tabular-nums">
                        Q{e.quarter} '{String(e.year).slice(2)}
                      </span>
                      <span className="text-[10px] text-[#263d2c] shrink-0">{fmtDateShort(e.date)}</span>
                      <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                        {e.epsEstimate != null && (
                          <span className="text-[10px] text-[var(--c-text-faint)] tabular-nums">
                            Est {fmtEps(e.epsEstimate)}
                          </span>
                        )}
                        {e.epsActual != null && (
                          <span className={`text-[10px] font-bold tabular-nums ${beat ? 'text-[#1D9E75]' : miss ? 'text-[#e24b4a]' : 'text-[var(--c-text)]'}`}>
                            {fmtEps(e.epsActual)}
                          </span>
                        )}
                        {hasBoth && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-widest shrink-0 ${
                            beat
                              ? 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25'
                              : miss
                              ? 'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25'
                              : 'bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] border-[var(--c-border)]'
                          }`}>
                            {beat ? 'Beat' : miss ? 'Miss' : 'Met'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
