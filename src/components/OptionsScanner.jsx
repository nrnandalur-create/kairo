function OptionRow({ opt }) {
  const isCall = opt.type === 'call'
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#1e2d28] last:border-0">
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 uppercase tracking-wider ${
        isCall ? 'bg-[#1D9E75]/10 text-[#1D9E75]' : 'bg-[#e55353]/10 text-[#e55353]'
      }`}>
        {opt.type}
      </span>
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div><p className="text-gray-600 text-[10px]">Strike</p><p className="text-gray-200 font-semibold">${opt.strike}</p></div>
        <div><p className="text-gray-600 text-[10px]">Expiry</p><p className="text-gray-200 font-semibold">{opt.expiry}</p></div>
        <div><p className="text-gray-600 text-[10px]">Open Int.</p><p className="text-gray-200 font-semibold">{opt.oi}</p></div>
        <div><p className="text-gray-600 text-[10px]">Premium</p><p className="text-gray-200 font-semibold">{opt.premium}</p></div>
      </div>
      <span className={`text-[10px] italic shrink-0 hidden sm:block ${opt.unusual ? 'text-yellow-500' : 'text-gray-600'}`}>
        {opt.note}
      </span>
    </div>
  )
}

export default function OptionsScanner({ data }) {
  if (!data?.length) return null
  const unusual = data.filter(o => o.unusual)
  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Options Scanner</span>
          {unusual.length > 0 && (
            <span className="text-[10px] font-bold text-yellow-500 bg-yellow-500/10 border border-yellow-500/25 px-2 py-0.5 rounded-full">
              {unusual.length} unusual
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-700 bg-[#111a17] px-2 py-1 rounded">Demo · live feed requires options API</span>
      </div>
      <div>{data.map((opt, i) => <OptionRow key={i} opt={opt} />)}</div>
    </div>
  )
}
