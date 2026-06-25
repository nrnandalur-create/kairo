import DataTimestamp from './DataTimestamp'
import { fmtCap, fmtPrice, fmtPct, fmtRatio } from '../utils/format'
import { calcRSI, calcMACD, calcVWAP } from '../utils/indicators'

function MetricCell({ label, value, color, badge, badgeColor }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">{label}</span>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-sm font-semibold tabular-nums ${color || 'text-[#d1d9d5]'} truncate`}>{value}</span>
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

export default function MetricsBar({ ticker, quote, profile, metrics, candles, asOf }) {
  if (!quote) return null

  const up   = quote.dp > 0
  const down = quote.dp < 0
  const chgColor = up ? 'text-[#1D9E75]' : down ? 'text-[#e24b4a]' : 'text-[#4b6358]'
  const arrow    = up ? '▲' : down ? '▼' : '◆'
  const chgStr   = quote.d != null
    ? `${up ? '+' : ''}${fmtRatio(quote.d)} (${up ? '+' : ''}${fmtRatio(quote.dp)}%)`
    : '—'

  const m    = metrics?.metric
  const hi52 = m?.['52WeekHigh']
  const lo52 = m?.['52WeekLow']

  // ── Row 2: technicals computed from candles + fundamentals from Finnhub
  const rsi  = candles?.length ? calcRSI(candles)   : null
  const macd = candles?.length ? calcMACD(candles)  : null
  const vwap = candles?.length ? calcVWAP(candles)  : null
  const rsiBadge = rsi == null ? null : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  const rsiBadgeColor = rsi == null ? '#4b6358' : rsi >= 70 ? '#e24b4a' : rsi <= 30 ? '#1D9E75' : '#4b6358'
  const macdBadge      = macd ? (macd.bullish ? 'Bullish' : 'Bearish') : null
  const macdBadgeColor = macd ? (macd.bullish ? '#1D9E75' : '#e24b4a') : '#4b6358'

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-5 sm:p-6 animate-enter flex flex-col gap-4">
      {/* Identity + price row */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
        <div className="flex flex-col gap-1">
          {/* Ticker · company · exchange */}
          <div className="flex items-center gap-2 flex-wrap">
            {ticker && (
              <span className="font-mono text-base font-black text-white tracking-[0.04em]">
                {ticker}
              </span>
            )}
            {ticker && profile?.name && <span className="text-[#263d2c]">·</span>}
            {profile?.name && (
              <span className="text-sm font-semibold text-[#d1d9d5]">{profile.name}</span>
            )}
            {profile?.exchange && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#1a2e1f] text-[#4b6358] uppercase tracking-widest border border-[#263d2c]">
                {profile.exchange}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-black text-white tabular-nums tracking-tight">
              {fmtPrice(quote.c)}
            </span>
            <span className={`text-base font-bold tabular-nums ${chgColor}`}>
              {arrow} {chgStr}
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1a2e1f]" />

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
      <div className="h-px bg-[#1a2e1f]/60" />

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
        <div className="flex items-center justify-end pt-3 -mb-1 border-t border-[#1a2e1f]/60">
          <DataTimestamp asOf={asOf} source="Finnhub" />
        </div>
      )}
    </div>
  )
}
