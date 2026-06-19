import { useNow } from '../hooks/useNow'
import { fmtRelTime } from '../utils/format'

// Renders "Updated 2m ago" with a live-updating relative time.
// Pass `asOf` as a Date or epoch ms (from the service layer's `fetchedAt`).
// `source` optionally appends the provider chip ("· Finnhub").
//
// Drop into any data-card footer. Designed to be subtle:
//   <div className="text-[10px] text-[#4b6358] mt-3 ...">
//     <DataTimestamp asOf={data.fetchedAt} source="Finnhub" />
//   </div>
export default function DataTimestamp({ asOf, source, prefix = 'Updated' }) {
  const now = useNow(15_000)            // re-render every 15s — granular enough for "Xs/m ago"
  if (!asOf) return null
  const rel = fmtRelTime(asOf, now.getTime())

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tabular-nums text-[#6b8478]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]/80" />
      <span>{prefix} {rel}</span>
      {source && (
        <>
          <span className="text-[#263d2c]">·</span>
          <span className="uppercase tracking-[0.14em] text-[#5d7868]">{source}</span>
        </>
      )}
    </span>
  )
}
