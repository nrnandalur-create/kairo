export default function AIAnalysis({ data }) {
  if (!data) return null

  const isBull = data.verdict === 'bullish'

  return (
    <div className="w-full bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">AI Analysis</h2>
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
            isBull
              ? 'bg-[#1D9E75]/15 text-[#1D9E75] border border-[#1D9E75]/30'
              : 'bg-[#e55353]/15 text-[#e55353] border border-[#e55353]/30'
          }`}
        >
          {isBull ? '▲ Bullish' : '▼ Bearish'}
        </span>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed">{data.summary}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1D9E75]/10 border border-[#1D9E75]/20 rounded-xl p-3">
          <p className="text-xs text-[#1D9E75] font-semibold mb-1">Bull Case</p>
          <p className="text-xs text-gray-400">{data.bullCase}</p>
        </div>
        <div className="bg-[#e55353]/10 border border-[#e55353]/20 rounded-xl p-3">
          <p className="text-xs text-[#e55353] font-semibold mb-1">Bear Case</p>
          <p className="text-xs text-gray-400">{data.bearCase}</p>
        </div>
      </div>
    </div>
  )
}
