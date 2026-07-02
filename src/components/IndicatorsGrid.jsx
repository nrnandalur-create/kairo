import { calcRSI, calcMACD, calcSMA, calcBBPosition, calcVolumeSignal } from '../utils/indicators'
import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'
import { usePrefs } from '../hooks/usePrefs'

// Plain-English one-liner per indicator. Shown as a hover explainer next to
// each card title. Copy is deliberately jargon-free.
const INDICATOR_TOOLTIPS = {
  'RSI (14)':    "Relative Strength Index over 14 days. Ranges 0-100. Under 30 = oversold (potential bounce), over 70 = overbought (potential pullback).",
  MACD:          "Moving Average Convergence Divergence. When the MACD line is above its signal line the trend is bullish; below is bearish.",
  'SMA 50':      "50-day Simple Moving Average — the average closing price over 50 sessions. Prices above the SMA suggest an uptrend.",
  'SMA 200':     "200-day Simple Moving Average — the long-term trend line. Prices above SMA 200 are considered bullish by most trend traders.",
  'BB Position': "Where the current price sits within its Bollinger Bands (0% = at lower band, 100% = at upper band). Near either edge = statistically stretched.",
  Volume:        "How many shares traded today compared to the 20-day average. Above 1.5× typically means real conviction behind the move.",
}

// Advanced indicators hidden when Beginner Mode is on — leaves RSI, SMA 50,
// and Volume visible (the three most intuitive readings).
const BEGINNER_HIDDEN_INDICATORS = new Set(['MACD', 'SMA 200', 'BB Position'])

function fmtNum(n, dec = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(dec)
}

function StatusBadge({ label, color }) {
  const styles = {
    green:  'bg-[#22B585]/10 text-[#22B585] border-[#22B585]/25',
    red:    'bg-[#ef5454]/10 text-[#ef5454] border-[#ef5454]/25',
    amber:  'bg-[#e3a234]/10 text-[#e3a234] border-[#e3a234]/25',
    muted:  'bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] border-[var(--c-border)]',
  }
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest whitespace-nowrap ${styles[color] ?? styles.muted}`}>
      {label}
    </span>
  )
}

function IndicatorCard({ title, value, sub, badge, badgeColor, bar, barColor }) {
  const tip = INDICATOR_TOOLTIPS[title]
  return (
    <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-3 sm:p-4 flex flex-col gap-2 sm:gap-2.5 transition-colors duration-200 hover:border-[var(--c-border-strong)] hover:bg-[var(--c-hover-bg)]">
      <span className="text-[10px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center min-w-0">
        <span className="truncate">{title}</span>
        {tip && <InfoTooltip label={`About ${title}`}>{tip}</InfoTooltip>}
      </span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-lg sm:text-xl font-black tabular-nums text-[var(--c-text)] leading-none">{value}</span>
        {badge && <StatusBadge label={badge} color={badgeColor} />}
      </div>
      {sub && <span className="text-[11px] text-[var(--c-text-faint)] leading-tight">{sub}</span>}
      {bar != null && (
        <div className="h-1 bg-[var(--c-chip-bg)] rounded-full overflow-hidden mt-0.5">
          <div
            className="h-full rounded-full animate-bar"
            style={{ width: `${Math.min(100, Math.max(0, bar))}%`, backgroundColor: barColor ?? '#22B585', transformOrigin: 'left' }}
          />
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4">
      <div className="h-2.5 w-36 rounded-full shimmer" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-4 flex flex-col gap-2.5">
            <div className="h-2 rounded-full shimmer w-3/5" />
            <div className="h-6 rounded-full shimmer w-2/5" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SyntheticEmptyState({ reason }) {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Technical Indicators</span>
      <div className="border border-[#e3a234]/30 bg-[#e3a234]/8 rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[#e3a234] text-base leading-none">⚠</span>
          <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#e3a234]">Real candle data unavailable</span>
        </div>
        <p className="text-[13px] leading-relaxed text-[var(--c-text)]/85">
          RSI, MACD, Bollinger Bands, SMAs, and volume are computed from real OHLC.
          For this ticker, none of our data sources returned bars right now — so the
          indicators are hidden rather than computed on simulated values. Try again
          shortly, or use a different ticker.
        </p>
        {reason && (
          <p className="text-[11px] font-mono text-[var(--c-text-fainter)] leading-relaxed">
            {reason}
          </p>
        )}
      </div>
    </div>
  )
}

export default function IndicatorsGrid({ candles, loading, asOf, synthetic, syntheticReason, currentPrice }) {
  const { beginnerMode } = usePrefs()
  if (loading) return <Skeleton />
  if (!candles?.length) return null
  if (synthetic) return <SyntheticEmptyState reason={syntheticReason} />

  // RSI — intraday-aware via currentPrice (matches Finviz/TradingView).
  const rsi = calcRSI(candles, 14, currentPrice)
  const rsiLabel  = rsi == null ? '—' : fmtNum(rsi, 1)
  const rsiBadge  = rsi == null ? null : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  const rsiBColor = rsi == null ? 'muted' : rsi >= 70 ? 'red' : rsi <= 30 ? 'green' : 'muted'

  // MACD
  const macd = calcMACD(candles, currentPrice)
  const macdLabel  = macd ? fmtNum(macd.value, 3) : '—'
  const macdSub    = macd ? `Signal ${fmtNum(macd.signal, 3)}` : null
  const macdBadge  = macd ? (macd.bullish ? 'Bullish' : 'Bearish') : null
  const macdBColor = macd ? (macd.bullish ? 'green' : 'red') : 'muted'

  // SMA 50
  const sma50  = calcSMA(candles, 50, currentPrice)
  const price  = candles.at(-1)?.close
  const sma50Label = sma50 ? `$${fmtNum(sma50)}` : '—'
  const sma50Diff  = sma50 && price ? ((price - sma50) / sma50 * 100) : null
  const sma50Sub   = sma50Diff != null ? `Price ${sma50Diff >= 0 ? '+' : ''}${fmtNum(sma50Diff, 1)}% vs SMA` : null
  const sma50Badge = sma50Diff == null ? null : sma50Diff >= 0 ? 'Above' : 'Below'
  const sma50BC    = sma50Diff == null ? 'muted' : sma50Diff >= 0 ? 'green' : 'red'

  // SMA 200
  const sma200  = calcSMA(candles, 200, currentPrice)
  const sma200Label = sma200 ? `$${fmtNum(sma200)}` : '—'
  const sma200Diff  = sma200 && price ? ((price - sma200) / sma200 * 100) : null
  const sma200Sub   = sma200Diff != null ? `Price ${sma200Diff >= 0 ? '+' : ''}${fmtNum(sma200Diff, 1)}% vs SMA` : null
  const sma200Badge = sma200Diff == null ? null : sma200Diff >= 0 ? 'Above' : 'Below'
  const sma200BC    = sma200Diff == null ? 'muted' : sma200Diff >= 0 ? 'green' : 'red'

  // Bollinger Band position
  const bb    = calcBBPosition(candles, 20, currentPrice)
  const bbPct = bb?.pct ?? null
  const bbLabel  = bbPct != null ? `${bbPct}%` : '—'
  const bbSub    = bb ? `$${fmtNum(bb.lower)} – $${fmtNum(bb.upper)}` : null
  const bbBadge  = bbPct == null ? null : bbPct >= 80 ? 'Near Top' : bbPct <= 20 ? 'Near Bottom' : 'Mid Band'
  const bbBColor = bbPct == null ? 'muted' : bbPct >= 80 ? 'red' : bbPct <= 20 ? 'green' : 'muted'
  const bbBarColor = bbPct >= 80 ? '#ef5454' : bbPct <= 20 ? '#22B585' : '#e3a234'

  // Volume
  const vol = calcVolumeSignal(candles)
  const volLabel = vol ? `${fmtNum(vol.ratio, 1)}×` : '—'
  const volSub   = vol ? `vs 20-day avg` : null
  const volBadge = vol == null ? null : vol.ratio >= 2 ? 'High Vol' : vol.ratio >= 1.2 ? 'Above Avg' : vol.ratio <= 0.7 ? 'Low Vol' : 'Normal'
  const volBColor= vol == null ? 'muted' : vol.ratio >= 1.5 ? 'amber' : vol.ratio <= 0.7 ? 'muted' : 'muted'
  const volBarPct = vol ? Math.min(100, vol.ratio * 50) : 0
  const volBarClr = vol?.ratio >= 1.5 ? '#e3a234' : '#4b6358'

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Technical Indicators</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { title: 'RSI (14)',     value: rsiLabel,   sub: null,       badge: rsiBadge,   badgeColor: rsiBColor, bar: rsi,       barColor: rsi >= 70 ? '#ef5454' : rsi <= 30 ? '#22B585' : '#4b6358' },
          { title: 'MACD',        value: macdLabel,  sub: macdSub,    badge: macdBadge,  badgeColor: macdBColor },
          { title: 'SMA 50',      value: sma50Label, sub: sma50Sub,   badge: sma50Badge, badgeColor: sma50BC },
          { title: 'SMA 200',     value: sma200Label,sub: sma200Sub,  badge: sma200Badge,badgeColor: sma200BC },
          { title: 'BB Position', value: bbLabel,    sub: bbSub,      badge: bbBadge,    badgeColor: bbBColor, bar: bbPct, barColor: bbBarColor },
          { title: 'Volume',      value: volLabel,   sub: volSub,     badge: volBadge,   badgeColor: volBColor, bar: volBarPct, barColor: volBarClr },
        // Beginner Mode: drop MACD, SMA 200, and BB Position so the grid
        // stays at RSI + SMA 50 + Volume — the three most intuitive reads
        // for someone new to technical analysis.
        ].filter(card => !(beginnerMode && BEGINNER_HIDDEN_INDICATORS.has(card.title))).map((card, i) => (
          <div key={card.title} className={`animate-enter d-${i + 1}`}>
            <IndicatorCard {...card} />
          </div>
        ))}
      </div>

      {/* Footer — data freshness */}
      {asOf && (
        <div className="flex items-center justify-end pt-2 -mb-1 border-t border-[var(--c-border)]/60">
          <DataTimestamp asOf={asOf} source="Computed" />
        </div>
      )}
    </div>
  )
}
