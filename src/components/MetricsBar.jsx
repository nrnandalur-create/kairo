import DataTimestamp from './DataTimestamp'
import { fmtCap, fmtPrice, fmtPct, fmtRatio } from '../utils/format'
import { calcRSI, calcMACD, calcVWAP } from '../utils/indicators'

function MetricCell({ label, value, color, badge, badgeColor }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">{label}</span>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-sm font-semibold tabular-nums ${color || 'text-[var(--c-text)]'} truncate`}>{value}</span>
        {badge && (
          <span
            className="text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border whitespace-nowrap leading-none"
            style={{ color: badgeColor, borderColor: `${badgeColor}55`, background: `${badgeColor}18` }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

// Fall back through all the P/E variants Finnhub may populate depending on the
// ticker's earnings reporting state.
function pickPE(m) {
  return m?.peBasicExclExtraTTM
      ?? m?.peTTM
      ?? m?.peExclExtraTTM
      ?? m?.peNormalizedAnnual
}

export default function MetricsBar({ ticker, quote, profile, metrics, candles, asOf, synthetic }) {
  if (!quote) return null

  const up   = quote.dp > 0
  const down = quote.dp < 0
  const chgColor = up ? 'text-[#22B585]' : down ? 'text-[#ef5454]' : 'text-[var(--c-text-faint)]'
  const arrow    = up ? '▲' : down ? '▼' : '◆'
  const chgStr   = quote.d != null
    ? `${up ? '+' : ''}${fmtRatio(quote.d)} (${up ? '+' : ''}${fmtRatio(quote.dp)}%)`
    : '—'

  const m    = metrics?.metric
  const hi52 = m?.['52WeekHigh']
  const lo52 = m?.['52WeekLow']

  // ── Row 2: technicals from candles. Suppress all three when synthetic
  // so the headline strip can't show RSI/MACD/VWAP values derived from noise.
  const realCandles = !synthetic && candles?.length
  // Intraday-aware via the live quote — matches Finviz/TradingView, which
  // overlay the current tick onto the most recent daily bar.
  const rsi  = realCandles ? calcRSI(candles, 14, quote?.c)   : null
  const macd = realCandles ? calcMACD(candles, quote?.c)      : null
  const vwap = realCandles ? calcVWAP(candles)                : null
  const rsiBadge = rsi == null ? null : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  const rsiBadgeColor = rsi == null ? '#4b6358' : rsi >= 70 ? '#ef5454' : rsi <= 30 ? '#22B585' : '#4b6358'
  const macdBadge      = macd ? (macd.bullish ? 'Bullish' : 'Bearish') : null
  const macdBadgeColor = macd ? (macd.bullish ? '#22B585' : '#ef5454') : '#4b6358'

  return (
    <div className="w-full glass-card rounded-2xl p-4 sm:p-5 md:p-6 animate-enter flex flex-col gap-4">
      {/* Identity + price row */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
        <div className="flex flex-col gap-1">
          {/* Ticker · company · exchange */}
          <div className="flex items-center gap-2 flex-wrap">
            {ticker && (
              <span className="font-mono text-base font-black text-[var(--c-text-strong)] tracking-[0.04em]">
                {ticker}
              </span>
            )}
            {ticker && profile?.name && <span className="text-[var(--c-text-fainter)]">·</span>}
            {profile?.name && (
              <span className="text-sm font-semibold text-[var(--c-text)]">{profile.name}</span>
            )}
            {profile?.exchange && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] uppercase tracking-widest border border-[var(--c-border-strong)]">
                {profile.exchange}
              </span>
            )}
            {synthetic && (
              <span
                title="Real OHLC data unavailable for this ticker right now. Technical indicators are hidden to avoid showing values computed on simulated bars."
                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#e3a234] border border-[#e3a234]/40 bg-[#e3a234]/10 px-2 py-0.5 rounded-full"
              >
                <span aria-hidden="true">⚠</span> Simulated data
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
            {/* Editorial-hero price: substantially larger than the surrounding
                cells, set in tabular-nums + tight tracking. The single largest
                number on the page; everything else reads as supporting data.
                Mobile scales down two steps so a 6-digit price ($1,234.56)
                still fits at 375px without wrapping the change chip. */}
            <span className="text-4xl sm:text-5xl md:text-6xl font-black text-[var(--c-text-strong)] tabular-nums tracking-[-0.02em] leading-none">
              {fmtPrice(quote.c)}
            </span>
            <span className={`text-sm sm:text-base font-bold tabular-nums ${chgColor}`}>
              {arrow} {chgStr}
            </span>
          </div>
        </div>
      </div>

      {/* Hairline rule — tinted in the change color. Replaces the old neutral
          divider so the bar's emotional state (up / flat / down) carries
          through into the page rhythm without any new chrome. */}
      <div
        className="h-px"
        style={{
          background: `linear-gradient(90deg,
            ${up ? 'rgba(34,181,133,0.35)' : down ? 'rgba(239,84,84,0.35)' : 'var(--c-border)'},
            transparent 75%)`,
        }}
      />

      {/* Row 1 — market overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCell label="Market Cap"  value={fmtCap(profile?.marketCapitalization)} />
        <MetricCell label="P/E (TTM)"   value={fmtRatio(pickPE(m), 1)} />
        <MetricCell label="Beta"        value={fmtRatio(m?.beta)} />
        <MetricCell label="52W Range"   value={hi52 && lo52 ? `${fmtPrice(lo52)} – ${fmtPrice(hi52)}` : '—'} />
        <MetricCell label="Day Range"   value={`${fmtPrice(quote.l)} – ${fmtPrice(quote.h)}`} />
        <MetricCell label="Prev Close"  value={fmtPrice(quote.pc)} />
      </div>

      {/* Subtle separator between overview and fundamentals + technicals */}
      <div className="h-px bg-[var(--c-chip-bg)]/60" />

      {/* Row 2 — fundamentals + technicals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCell label="VWAP (20D)"  value={vwap != null ? fmtPrice(vwap) : '—'} />
        <MetricCell
          label="RSI (14)"
          value={rsi != null ? fmtRatio(rsi, 1) : '—'}
          badge={rsiBadge}
          badgeColor={rsiBadgeColor}
        />
        <MetricCell
          label="MACD"
          value={macd ? fmtRatio(macd.value, 3) : '—'}
          badge={macdBadge}
          badgeColor={macdBadgeColor}
        />
        <MetricCell label="Div Yield"   value={m?.dividendYieldIndicatedAnnual != null ? fmtPct(m.dividendYieldIndicatedAnnual) : '—'} />
        <MetricCell label="EPS Gr. 5Y"  value={m?.epsGrowth5Y != null ? fmtPct(m.epsGrowth5Y) : '—'} />
        <MetricCell label="P/S (TTM)"   value={fmtRatio(m?.psTTM, 2)} />
      </div>

      {/* Footer — data freshness */}
      {asOf && (
        <div className="flex items-center justify-end pt-3 -mb-1 border-t border-[var(--c-border)]/60">
          <DataTimestamp asOf={asOf} source="Finnhub" />
        </div>
      )}
    </div>
  )
}
