const COLS = ['Type', 'Strike', 'Expiry', 'Open Int.', 'Premium', 'Note']

function TypeBadge({ type }) {
  const isCall = type === 'call'
  return (
    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-widest ${
      isCall
        ? 'bg-[#1D9E75]/10 text-[#1D9E75]'
        : 'bg-[#e24b4a]/10 text-[#e24b4a]'
    }`}>
      {type}
    </span>
  )
}

export default function OptionsScanner({ data }) {
  if (!data?.length) return null
  const unusual = data.filter(o => o.unusual)

  return (
    <div className="w-full glass-card rounded-2xl p-6 flex flex-col gap-4 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Options Flow</span>
          {unusual.length > 0 && (
            <span className="text-[10px] font-bold text-[#d4922a] bg-[#d4922a]/10 border border-[#d4922a]/25 px-2 py-0.5 rounded-full">
              {unusual.length} unusual
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--c-text-faint)] bg-[var(--c-input-bg)] border border-[var(--c-input-border)] px-2.5 py-1 rounded-lg">
          Live options data unavailable
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs min-w-[520px]">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              {COLS.map(col => (
                <th key={col} className="text-left pb-2.5 text-[10px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.1em] px-2 first:pl-1 last:pr-1">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((opt, i) => (
              <tr
                key={i}
                className={`border-b border-[var(--c-border)]/60 last:border-0 ${opt.unusual ? 'bg-[#d4922a]/5' : ''}`}
              >
                <td className="py-3 px-2 first:pl-1">
                  <TypeBadge type={opt.type} />
                </td>
                <td className="py-3 px-2 font-semibold text-[var(--c-text)] tabular-nums">${opt.strike}</td>
                <td className="py-3 px-2 text-[var(--c-text)]">{opt.expiry}</td>
                <td className="py-3 px-2 tabular-nums text-[var(--c-text)]">{opt.oi}</td>
                <td className="py-3 px-2 font-semibold tabular-nums text-[var(--c-text)]">{opt.premium}</td>
                <td className="py-3 px-2 last:pr-1">
                  <span className={`italic ${opt.unusual ? 'text-[#d4922a]' : 'text-[var(--c-text-faint)]'}`}>
                    {opt.note}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
