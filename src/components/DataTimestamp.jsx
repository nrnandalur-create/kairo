import { useNow } from '../hooks/useNow'
import { usePrefs } from '../hooks/usePrefs'
import { fmtRelTime } from '../utils/format'

// Renders "Updated 2m ago" with a live-updating relative time.
// Pass `asOf` as a Date or epoch ms (from the service layer's `fetchedAt`).
// `source` optionally appends the provider chip ("· Finnhub").
//
// Drop into any data-card footer. Designed to be subtle:
//   <div className="text-[10px] text-[var(--c-text-faint)] mt-3 ...">
//     <DataTimestamp asOf={data.fetchedAt} source="Finnhub" />
//   </div>
// `staleAfterMs` flips the dot + text to amber when the data crosses the
// threshold. Default 10 minutes mirrors the auto-refresh window (5 min
// interval + 1 missed cycle) — by the time the dot turns amber, the
// system has tried and failed to refresh at least once.
export default function DataTimestamp({ asOf, source, prefix = 'Updated', staleAfterMs }) {
  const now      = useNow(15_000)            // re-render every 15s — granular enough for "Xs/m ago"
  const prefs    = usePrefs()
  // Caller can override per-instance; otherwise pick up the user's Settings choice.
  const stalemsEffective = staleAfterMs ?? prefs.staleMs

  if (!asOf) return null
  const nowMs = now.getTime()
  const rel   = fmtRelTime(asOf, nowMs)
  const stale = (nowMs - asOf) >= stalemsEffective

  const dotClass  = stale ? 'bg-[#e3a234]/85' : 'bg-[#22B585]/80'
  const textClass = stale ? 'text-[#e3a234]'  : 'text-[var(--c-text-muted)]'
  const srcClass  = stale ? 'text-[var(--c-text-fainter)]'  : 'text-[var(--c-text-muted)]'
  const title     = stale
    ? `Data is older than ${Math.round(stalemsEffective / 60_000)} minutes. A refresh will run when you return to the tab.`
    : undefined

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10.5px] tabular-nums ${textClass}`} title={title}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      <span>{prefix} {rel}</span>
      {source && (
        <>
          <span className="text-[var(--c-text-fainter)]">·</span>
          <span className={`uppercase tracking-[0.14em] ${srcClass}`}>{source}</span>
        </>
      )}
    </span>
  )
}
