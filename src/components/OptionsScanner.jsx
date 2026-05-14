function OptionRow({ opt }) {
  const isCall = opt.type === 'call'
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#2e3347] last:border-0">
      <span
        className={`text-xs font-bold px-2 py-0.5 rounded ${
          isCall ? 'bg-[#1D9E75]/15 text-[#1D9E75]' : 'bg-[#e55353]/15 text-[#e55353]'
        }`}
      >
        {opt.type.toUpperCase()}
      </span>
      <div className="flex-1 grid grid-cols-4 gap-2 text-xs">
        <div>
          <p className="text-gray-500">Strike</p>
          <p className="text-gray-100 font-medium">${opt.strike}</p>
        </div>
        <div>
          <p className="text-gray-500">Expiry</p>
          <p className="text-gray-100 font-medium">{opt.expiry}</p>
        </div>
        <div>
          <p className="text-gray-500">OI</p>
          <p className="text-gray-100 font-medium">{opt.oi}</p>
        </div>
        <div>
          <p className="text-gray-500">Premium</p>
          <p className="text-gray-100 font-medium">{opt.premium}</p>
        </div>
      </div>
      <span className="text-xs text-gray-400 italic">{opt.note}</span>
    </div>
  )
}

export default function OptionsScanner({ data }) {
  if (!data?.length) return null

  return (
    <div className="w-full bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Options Scanner</h2>
      <div>
        {data.map((opt, i) => (
          <OptionRow key={i} opt={opt} />
        ))}
      </div>
    </div>
  )
}
