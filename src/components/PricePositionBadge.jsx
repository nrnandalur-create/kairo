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

export default function PricePositionBadge({ currentPrice, hi52, lo52, ath, atl, athDate, atlDate }) {
  if (currentPrice == null || !Number.isFinite(currentPrice)) return null

  // The 52W range must be usable to show anything at all — without it,
  // the position pct is meaningless and the ATH/ATL edges are less useful
  // out of context. We render nothing rather than a partial state.
  if (hi52 == null || lo52 == null || hi52 <= lo52) return null

  const nearAth = within(currentPrice, ath, NEAR_ATH_ATL_PCT)
  const nearAtl = within(currentPrice, atl, NEAR_ATH_ATL_PCT)
  const near52H = within(currentPrice, hi52, NEAR_52W_PCT)
  const near52L = within(currentPrice, lo52, NEAR_52W_PCT)

  // Percentage of the way up the 52-week range.
  // (current - lo52) / (hi52 - lo52) * 100, clamped 0-100.
  const posPct = Math.max(0, Math.min(100,
    Math.round((currentPrice - lo52) / (hi52 - lo52) * 100)
  ))

  const rangeLine = `52W Range: ${fmtPrice(lo52)} — ${fmtPrice(hi52)} | Current: ${posPct}% of range`
  const athLine   = ath != null
    ? ` | ATH: ${fmtPrice(ath)}${athDate ? ` (${athDate})` : ''}`
    : ''
  const atlLine   = atl != null
    ? ` | ATL: ${fmtPrice(atl)}${atlDate ? ` (${atlDate})` : ''}`
    : ''
  const tooltip = rangeLine + athLine + atlLine

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

  return <RangeText pct={posPct} tooltip={tooltip} />
}
