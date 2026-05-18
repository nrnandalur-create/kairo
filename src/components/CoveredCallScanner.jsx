import { useState, useEffect } from 'react'

const CONTRACTS = 2
const SHARES    = CONTRACTS * 100

const STRIKES = [
  { pct: 0.10, premiumPct: 0.028, label: '+10%' },
  { pct: 0.15, premiumPct: 0.022, label: '+15%' },
  { pct: 0.20, premiumPct: 0.016, label: '+20%' },
  { pct: 0.25, premiumPct: 0.011, label: '+25%', suggested: true },
]

function getNextFridays(n = 4) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = today.getDay()
  const daysToFirst = day <= 4 ? 5 - day : 12 - day
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + daysToFirst + i * 7)
    return d
  })
}

function fmtExpiry(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtExpiryFromDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtMoney(n) {
  if (n >= 10_000) return `$${(n / 1_000).toFixed(0)}k`
  if (n >=  1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

export default function CoveredCallScanner({ currentPrice, ticker }) {
  const [liveContracts, setLiveContracts] = useState(null)
  const [fetchingLive,  setFetchingLive]  = useState(false)

  useEffect(() => {
    if (!ticker || !currentPrice) return
    let cancelled = false
    setLiveContracts(null)
    setFetchingLive(true)
    fetch(`/api/options?symbol=${encodeURIComponent(ticker)}&price=${currentPrice}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        if (d?.contracts?.length) setLiveContracts(d.contracts)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFetchingLive(false) })
    return () => { cancelled = true }
  }, [ticker, currentPrice])

  if (!currentPrice) return null

  const fridays = getNextFridays(4)
  const hasLive = liveContracts?.some(c => c.real)

  const rows = STRIKES.map(({ pct, premiumPct, label, suggested }, i) => {
    const estStrike   = Math.ceil(currentPrice * (1 + pct))
    const estExpiry   = fridays[i]
    const estPremium  = +(estStrike * premiumPct).toFixed(2)

    const live        = liveContracts?.[i]
    const useReal     = live?.real && live?.premium != null

    const strike      = useReal ? live.strike      : estStrike
    const expiry      = useReal ? live.expiry       : null
    const premiumPer  = useReal ? live.premium      : estPremium
    const premiumTotal = premiumPer * SHARES
    const maxProfit   = premiumTotal + (strike - currentPrice) * SHARES
    const roi         = (maxProfit / (currentPrice * SHARES)) * 100
    const iv          = useReal ? live.iv           : null

    return {
      label, strike, expiry, estExpiry,
      premiumPer, premiumTotal, maxProfit, roi,
      suggested: !!suggested, real: useReal, iv,
    }
  })

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-5 flex flex-col gap-4 animate-enter">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">
            Covered Call Scanner
          </span>
          <p className="text-[10px] text-[#263d2c] mt-0.5">Sell calls on your long position</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {fetchingLive && (
            <div className="w-3 h-3 rounded-full border border-transparent border-t-[#1D9E75] animate-spin" />
          )}
          {!fetchingLive && hasLive && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-[#1D9E75] uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75]" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto -mx-5 px-5">
        <div className="min-w-[520px]">

          {/* Column headers */}
          <div className="flex items-center gap-3 pb-2 border-b border-[#1a2e1f]">
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-10 shrink-0">OTM</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-16 shrink-0">Strike</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-16 shrink-0">Expiry</span>
            <span className="text-[9px] font-bold text-[#263d2c] uppercase tracking-widest w-28 shrink-0">Est. Premium</span>
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
                {row.expiry ? fmtExpiry(row.expiry) : fmtExpiryFromDate(row.estExpiry)}
              </span>

              {/* Premium */}
              <div className="w-28 shrink-0">
                <p className="text-xs text-[#d1d9d5] tabular-nums leading-none">
                  ${row.premiumPer.toFixed(2)}<span className="text-[#4b6358]">/sh</span>
                  {!row.real && <span className="text-[#263d2c] ml-1 text-[9px]">(est.)</span>}
                </p>
                <p className="text-[9px] text-[#4b6358] tabular-nums mt-0.5">
                  {fmtMoney(row.premiumTotal)} total
                  {row.real && row.iv != null && (
                    <span className="ml-1 text-[#263d2c]">IV {(row.iv * 100).toFixed(0)}%</span>
                  )}
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
        {hasLive
          ? `Live data via Polygon.io · ${CONTRACTS} contracts (${SHARES} shares) · Midpoint of bid/ask`
          : `Based on ${CONTRACTS} contracts (${SHARES} shares). Premiums are estimates — verify with your broker.`
        }
      </p>
    </div>
  )
}
