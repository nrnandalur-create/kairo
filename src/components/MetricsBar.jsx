function Metric({ label, value, highlight }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span
        className={`text-sm font-semibold ${highlight === 'bull' ? 'text-[#1D9E75]' : highlight === 'bear' ? 'text-[#e55353]' : 'text-gray-100'}`}
      >
        {value}
      </span>
    </div>
  )
}

export default function MetricsBar({ data }) {
  if (!data) return null

  const changeHighlight = data.change?.startsWith('+') ? 'bull' : data.change?.startsWith('-') ? 'bear' : null

  return (
    <div className="w-full bg-[#1a1d27] border border-[#2e3347] rounded-2xl px-6 py-4 flex flex-wrap gap-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Price</span>
        <span className="text-2xl font-bold text-gray-100">{data.price}</span>
      </div>
      <div className="w-px bg-[#2e3347] self-stretch" />
      <Metric label="Change" value={data.change} highlight={changeHighlight} />
      <Metric label="Market Cap" value={data.marketCap} />
      <Metric label="P/E Ratio" value={data.pe} />
      <Metric label="IV Rank" value={data.ivRank} />
      <Metric label="Volume" value={data.volume} />
    </div>
  )
}
