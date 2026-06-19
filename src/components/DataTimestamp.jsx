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
    <span className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.08em] tabular-nums text-[#4b6358]">
      <span className="w-1 h-1 rounded-full bg-[#1D9E75]/70" />
      <span>{prefix} {rel}</span>
      {source && (
        <>
          <span className="text-[#1a2e1f]">·</span>
          <span className="uppercase tracking-[0.16em] text-[#3a4f44]">{source}</span>
        </>
      )}
    </span>
  )
}
