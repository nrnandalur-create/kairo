// One shared visual language for "real data is unavailable", used across the
// candle chart, the technical indicators grid, and both AI panels. Before this
// existed each surface improvised its own signal — the chart showed a
// "SIMULATED DATA" badge, the indicators said "unavailable" with no badge, and
// the AI Recommendation showed a confident verdict as if nothing were wrong.
// Now every surface speaks the SAME amber ⚠ language: a header badge + a notice
// body, and never a fabricated reading dressed up as real.

// Canonical copy so every panel words it the same way.
export const RECOMMENDATION_UNAVAILABLE_MSG =
  'Recommendation unavailable — insufficient technical data'

// Small amber pill for a panel header, next to the panel title.
export function UnavailableBadge({ label = 'UNAVAILABLE', title }) {
  return (
    <span
      title={title ?? 'Real market data is unavailable for this ticker right now.'}
      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#e3a234] border border-[#e3a234]/40 bg-[#e3a234]/10 px-2 py-0.5 rounded-full whitespace-nowrap"
    >
      <span aria-hidden="true">⚠</span> {label}
    </span>
  )
}

// Full-width amber notice that replaces a panel's data region when there is no
// real data to show. `reason` renders the raw upstream failure string (mono,
// muted) for the technically curious without shouting it.
export function UnavailableNotice({ title = 'Data unavailable', children, reason }) {
  return (
    <div className="border border-[#e3a234]/30 bg-[#e3a234]/8 rounded-xl p-4 flex flex-col gap-2 animate-fade">
      <div className="flex items-center gap-2">
        <span className="text-[#e3a234] text-base leading-none" aria-hidden="true">⚠</span>
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#e3a234]">{title}</span>
      </div>
      {children && (
        <p className="text-[13px] leading-relaxed text-[var(--c-text)]/85">{children}</p>
      )}
      {reason && (
        <p className="text-[11px] font-mono text-[var(--c-text-fainter)] leading-relaxed">{reason}</p>
      )}
    </div>
  )
}
