const CONTRACTS = 2
const SHARES    = CONTRACTS * 100

// Strike OTM %, paired Friday index (0=nearest), and estimated premium as % of strike
const STRIKES = [
  { pct: 0.10, premiumPct: 0.028, label: '+10%' },
  { pct: 0.15, premiumPct: 0.022, label: '+15%' },
  { pct: 0.20, premiumPct: 0.016, label: '+20%' },
  { pct: 0.25, premiumPct: 0.011, label: '+25%', suggested: true },
]

function getNextFridays(n = 4) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = today.getDay() // 0=Sun … 6=Sat
  // Days until the next Friday (if today is Friday, go to next week)
  const daysToFirst = day <= 4 ? 5 - day : 12 - day
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + daysToFirst + i * 7)
    return d
  })
}

function fmtExpiry(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtMoney(n) {
  if (n >= 10_000) return `$${(n / 1_000).toFixed(0)}k`
  if (n >=  1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

export default function CoveredCallScanner({ currentPrice, ticker }) {
  if (!currentPrice) return null

  const fridays = getNextFridays(4)

  const rows = STRIKES.map(({ pct, premiumPct, label, suggested }, i) => {
    const strike       = Math.ceil(currentPrice * (1 + pct))
    const expiry       = fridays[i]
    const premiumPer   = +(strike * premiumPct).toFixed(2)
    const premiumTotal = premiumPer * SHARES
    const maxProfit    = premiumTotal + (strike - currentPrice) * SHARES
    const roi          = (maxProfit / (currentPrice * SHARES)) * 100
    return { label, strike, expiry, premiumPer, premiumTotal, maxProfit, roi, suggested: !!suggested }
  })

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-5 flex flex-col gap-4 animate-enter">

      {/* Header */}
      <div>
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">
          Covered Call Scanner
        </span>
        <p className="text-[10px] text-[#263d2c] mt-0.5">Sell calls on your long position</p>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto -mx-5 px-5">
        <div className="min-w-[500px]">

          {/* Column headers */}
          <div className="flex items-center gap-3 pb-2 border-b border-[#1a2e1f]">
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-10 shrink-0">OTM</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-16 shrink-0">Strike</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-16 shrink-0">Expiry</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-24 shrink-0">Est. Premium</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-20 shrink-0">Max Profit</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest flex-1 text-right">ROI</span>
          </div>

          {/* Data rows */}
          {rows.map(row => (
            <div
              key={row.label}
              className={`relative flex items-center gap-3 py-3 border-b border-[#1a2e1f] last:border-0 ${
                row.suggested ? 'bg-[#1D9E75]/[0.04] rounded-lg' : ''
              }`}
            >
              {row.suggested && (
                <span className="absolute left-0 top-3 bottom-3 w-[3px] bg-[#1D9E75] rounded-r-full" />
              )}

              {/* OTM % */}
              <span className="text-[10px] font-bold text-[#4b6358] w-10 shrink-0 tabular-nums pl-1">
                {row.label}
              </span>

              {/* Strike */}
              <span className="text-xs font-bold text-[#d1d9d5] w-16 shrink-0 tabular-nums">
                ${row.strike.toLocaleString()}
              </span>

              {/* Expiry */}
              <span className="text-xs text-[#4b6358] w-16 shrink-0">
                {fmtExpiry(row.expiry)}
              </span>

              {/* Premium */}
              <div className="w-24 shrink-0">
                <p className="text-xs text-[#d1d9d5] tabular-nums leading-none">
                  ${row.premiumPer.toFixed(2)}<span className="text-[#4b6358]">/sh</span>
                </p>
                <p className="text-[9px] text-[#4b6358] tabular-nums mt-0.5">
                  {fmtMoney(row.premiumTotal)} total
                </p>
              </div>

              {/* Max Profit */}
              <span className="text-xs font-bold text-[#1D9E75] tabular-nums w-20 shrink-0">
                {fmtMoney(row.maxProfit)}
              </span>

              {/* ROI + badge */}
              <div className="flex-1 flex items-center justify-end gap-2">
                <span className="text-xs font-bold text-[#1D9E75] tabular-nums">
                  {row.roi.toFixed(1)}%
                </span>
                {row.suggested && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#1D9E75]/10 text-[#1D9E75] border border-[#1D9E75]/25 uppercase tracking-widest shrink-0">
                    Suggested
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-[#263d2c] leading-relaxed border-t border-[#1a2e1f] pt-3">
        Based on {CONTRACTS} contracts ({SHARES} shares). Premiums are estimates — verify with your broker.
      </p>
    </div>
  )
}
