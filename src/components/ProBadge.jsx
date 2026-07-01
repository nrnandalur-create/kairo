// Small green PRO chip shown next to the user avatar when the caller is a
// Pro subscriber. Pure presentational — no data fetching. `size` scales the
// padding/typography for header vs sidebar placements.
export default function ProBadge({ size = 'sm' }) {
  const cls = size === 'lg'
    ? 'text-[10px] px-2 py-0.5'
    : 'text-[9px] px-1.5 py-0.5'
  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-widest rounded-full border bg-[#22B585]/12 text-[#22B585] border-[#22B585]/30 leading-none ${cls}`}
      title="Kairo Pro"
    >
      Pro
    </span>
  )
}
