// Price-position indicator that sits inline next to the hero price in
// MetricsBar. Five possible states, evaluated in strictest-first order:
//
//   ATH        — current within 2% of all-time high
//   52W HIGH   — current within 5% of 52-week high (and not ATH)
//   52W LOW    — current within 5% of 52-week low
//   ATL        — current within 2% of all-time low
//   NORMAL     — none of the above; render % of 52W range
//
// ATH / ATL data arrives asynchronously via the fundamentals response.
// The 52W numbers come from the same metrics object that populates the
// stat grid, so the badge renders instantly on load and upgrades to the
// ATH / ATL state as soon as the deeper history lands.

const NEAR_ATH_ATL_PCT = 2   // "within 2%" per spec
const NEAR_52W_PCT     = 5   // "within 5%" per spec

function fmtPrice(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${Number(n).toFixed(2)}`
}

function within(current, ref, pct) {
  if (current == null || ref == null || ref <= 0) return false
  return Math.abs(current - ref) / ref * 100 <= pct
}

// Match the existing StatusBadge look used in IndicatorsGrid — tinted bg,
// tinted border, bold uppercase micro-label. Keeps the badge visually
// consistent with RSI / MACD / etc. chips already on the page.
function Badge({ color, label, arrow, tooltip }) {
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest whitespace-nowrap select-none cursor-help"
      style={{
        color,
        borderColor:     `${color}55`,
        backgroundColor: `${color}18`,
      }}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">{arrow}</span>
      {label}
    </span>
  )
}

// Neutral in-range indicator. Muted foreground; no badge chrome.
function RangeText({ pct, tooltip }) {
  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 text-[11px] tabular-nums text-[var(--c-text-faint)] whitespace-nowrap cursor-help"
    >
      <span aria-hidden="true" className="text-[8px] leading-none">▪</span>
      {pct}% of 52W range
    </span>
  )
}

// Sanity check for Finnhub's occasional share-class mix-up: BRK.B (~$500)
// returns the BRK.A ($685K+) 52W range from /stock/metric. When the price
// falls outside 2x the reported range in either direction, treat the 52W
// data as unusable and fall through to the ATH-only path.
function is52WPlausible(currentPrice, hi52, lo52) {
  if (hi52 == null || lo52 == null || hi52 <= lo52) return false
  if (lo52 <= 0) return false
  if (currentPrice < lo52 * 0.5) return false
  if (currentPrice > hi52 * 2)   return false
  return true
}

export default function PricePositionBadge({ currentPrice, hi52, lo52, ath, atl, athDate, atlDate }) {
  if (currentPrice == null || !Number.isFinite(currentPrice)) return null

  const has52W  = is52WPlausible(currentPrice, hi52, lo52)
  const hasAth  = ath != null && Number.isFinite(ath) && ath > 0
  const hasAtl  = atl != null && Number.isFinite(atl) && atl > 0

  // Nothing usable at all → don't render. Better silence than misinformation.
  if (!has52W && !hasAth && !hasAtl) return null

  const nearAth = hasAth && within(currentPrice, ath, NEAR_ATH_ATL_PCT)
  const nearAtl = hasAtl && within(currentPrice, atl, NEAR_ATH_ATL_PCT)
  const near52H = has52W && within(currentPrice, hi52, NEAR_52W_PCT)
  const near52L = has52W && within(currentPrice, lo52, NEAR_52W_PCT)

  // Position % is only meaningful when 52W is usable.
  const posPct = has52W
    ? Math.max(0, Math.min(100, Math.round((currentPrice - lo52) / (hi52 - lo52) * 100)))
    : null

  // Build the tooltip from whichever pieces we have — never lie about missing
  // data by defaulting to "—" inside otherwise-precise dollar strings.
  const parts = []
  if (has52W) {
    parts.push(`52W Range: ${fmtPrice(lo52)} — ${fmtPrice(hi52)} | Current: ${posPct}% of range`)
  }
  if (hasAth) {
    parts.push(`ATH: ${fmtPrice(ath)}${athDate ? ` (${athDate})` : ''}`)
  }
  if (hasAtl) {
    parts.push(`ATL: ${fmtPrice(atl)}${atlDate ? ` (${atlDate})` : ''}`)
  }
  const tooltip = parts.join(' | ')

  // Strictest-first: ATH beats 52W HIGH which beats NORMAL. Same on the low side.
  if (nearAth) {
    return <Badge color="#22B585" label="ATH"      arrow="▲" tooltip={tooltip} />
  }
  if (nearAtl) {
    return <Badge color="#ef5454" label="ATL"      arrow="▼" tooltip={tooltip} />
  }
  if (near52H) {
    return <Badge color="#22B585" label="52W HIGH" arrow="▲" tooltip={tooltip} />
  }
  if (near52L) {
    return <Badge color="#ef5454" label="52W LOW"  arrow="▼" tooltip={tooltip} />
  }

  // Position % requires a real 52W range. When Finnhub gave us the wrong
  // share-class range (BRK.B → BRK.A quirk), suppress the misleading pct
  // rather than showing "0% of range" or "100% of range" for something
  // that's neither.
  if (posPct == null) return null

  return <RangeText pct={posPct} tooltip={tooltip} />
}
