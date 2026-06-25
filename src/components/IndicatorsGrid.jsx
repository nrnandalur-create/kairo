import { calcRSI, calcMACD, calcSMA, calcBBPosition, calcVolumeSignal } from '../utils/indicators'
import DataTimestamp from './DataTimestamp'

function fmtNum(n, dec = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(dec)
}

function StatusBadge({ label, color }) {
  const styles = {
    green:  'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25',
    red:    'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25',
    amber:  'bg-[#d4922a]/10 text-[#d4922a] border-[#d4922a]/25',
    muted:  'bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] border-[var(--c-border)]',
  }
  return (
    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest whitespace-nowrap ${styles[color] ?? styles.muted}`}>
      {label}
    </span>
  )
}

function IndicatorCard({ title, value, sub, badge, badgeColor, bar, barColor }) {
  return (
    <div className="bg-[var(--c-bg-deep)] border border-[var(--c-border)] rounded-xl p-4 flex flex-col gap-2.5 transition-colors duration-200 hover:border-[var(--c-border-strong)] hover:bg-[#0c1410]">
      <span className="text-[10px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">{title}</span>
      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-black tabular-nums text-[var(--c-text)] leading-none">{value}</span>
        {badge && <StatusBadge label={badge} color={badgeColor} />}
      </div>
      {sub && <span className="text-[11px] text-[var(--c-text-faint)] leading-tight">{sub}</span>}
      {bar != null && (
        <div className="h-1 bg-[var(--c-chip-bg)] rounded-full overflow-hidden mt-0.5">
          <div
            className="h-full rounded-full animate-bar"
            style={{ width: `${Math.min(100, Math.max(0, bar))}%`, backgroundColor: barColor ?? '#1D9E75', transformOrigin: 'left' }}
          />
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full glass-card rounded-2xl p-6 flex flex-col gap-4">
      <div className="h-2.5 w-36 rounded-full shimmer" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[var(--c-bg-deep)] border border-[var(--c-border)] rounded-xl p-4 flex flex-col gap-2.5">
            <div className="h-2 rounded-full shimmer w-3/5" />
            <div className="h-6 rounded-full shimmer w-2/5" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function IndicatorsGrid({ candles, loading, asOf }) {
  if (loading) return <Skeleton />
  if (!candles?.length) return null

  // RSI
  const rsi = calcRSI(candles)
  const rsiLabel  = rsi == null ? '—' : fmtNum(rsi, 1)
  const rsiBadge  = rsi == null ? null : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  const rsiBColor = rsi == null ? 'muted' : rsi >= 70 ? 'red' : rsi <= 30 ? 'green' : 'muted'

  // MACD
  const macd = calcMACD(candles)
  const macdLabel  = macd ? fmtNum(macd.value, 3) : '—'
  const macdSub    = macd ? `Signal ${fmtNum(macd.signal, 3)}` : null
  const macdBadge  = macd ? (macd.bullish ? 'Bullish' : 'Bearish') : null
  const macdBColor = macd ? (macd.bullish ? 'green' : 'red') : 'muted'

  // SMA 50
  const sma50  = calcSMA(candles, 50)
  const price  = candles.at(-1)?.close
  const sma50Label = sma50 ? `$${fmtNum(sma50)}` : '—'
  const sma50Diff  = sma50 && price ? ((price - sma50) / sma50 * 100) : null
  const sma50Sub   = sma50Diff != null ? `Price ${sma50Diff >= 0 ? '+' : ''}${fmtNum(sma50Diff, 1)}% vs SMA` : null
  const sma50Badge = sma50Diff == null ? null : sma50Diff >= 0 ? 'Above' : 'Below'
  const sma50BC    = sma50Diff == null ? 'muted' : sma50Diff >= 0 ? 'green' : 'red'

  // SMA 200
  const sma200  = calcSMA(candles, 200)
  const sma200Label = sma200 ? `$${fmtNum(sma200)}` : '—'
  const sma200Diff  = sma200 && price ? ((price - sma200) / sma200 * 100) : null
  const sma200Sub   = sma200Diff != null ? `Price ${sma200Diff >= 0 ? '+' : ''}${fmtNum(sma200Diff, 1)}% vs SMA` : null
  const sma200Badge = sma200Diff == null ? null : sma200Diff >= 0 ? 'Above' : 'Below'
  const sma200BC    = sma200Diff == null ? 'muted' : sma200Diff >= 0 ? 'green' : 'red'

  // Bollinger Band position
  const bb    = calcBBPosition(candles)
  const bbPct = bb?.pct ?? null
  const bbLabel  = bbPct != null ? `${bbPct}%` : '—'
  const bbSub    = bb ? `$${fmtNum(bb.lower)} – $${fmtNum(bb.upper)}` : null
  const bbBadge  = bbPct == null ? null : bbPct >= 80 ? 'Near Top' : bbPct <= 20 ? 'Near Bottom' : 'Mid Band'
  const bbBColor = bbPct == null ? 'muted' : bbPct >= 80 ? 'red' : bbPct <= 20 ? 'green' : 'muted'
  const bbBarColor = bbPct >= 80 ? '#e24b4a' : bbPct <= 20 ? '#1D9E75' : '#d4922a'

  // Volume
  const vol = calcVolumeSignal(candles)
  const volLabel = vol ? `${fmtNum(vol.ratio, 1)}×` : '—'
  const volSub   = vol ? `vs 20-day avg` : null
  const volBadge = vol == null ? null : vol.ratio >= 2 ? 'High Vol' : vol.ratio >= 1.2 ? 'Above Avg' : vol.ratio <= 0.7 ? 'Low Vol' : 'Normal'
  const volBColor= vol == null ? 'muted' : vol.ratio >= 1.5 ? 'amber' : vol.ratio <= 0.7 ? 'muted' : 'muted'
  const volBarPct = vol ? Math.min(100, vol.ratio * 50) : 0
  const volBarClr = vol?.ratio >= 1.5 ? '#d4922a' : '#4b6358'

  return (
    <div className="w-full glass-card rounded-2xl p-6 flex flex-col gap-4 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Technical Indicators</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { title: 'RSI (14)',     value: rsiLabel,   sub: null,       badge: rsiBadge,   badgeColor: rsiBColor, bar: rsi,       barColor: rsi >= 70 ? '#e24b4a' : rsi <= 30 ? '#1D9E75' : '#4b6358' },
          { title: 'MACD',        value: macdLabel,  sub: macdSub,    badge: macdBadge,  badgeColor: macdBColor },
          { title: 'SMA 50',      value: sma50Label, sub: sma50Sub,   badge: sma50Badge, badgeColor: sma50BC },
          { title: 'SMA 200',     value: sma200Label,sub: sma200Sub,  badge: sma200Badge,badgeColor: sma200BC },
          { title: 'BB Position', value: bbLabel,    sub: bbSub,      badge: bbBadge,    badgeColor: bbBColor, bar: bbPct, barColor: bbBarColor },
          { title: 'Volume',      value: volLabel,   sub: volSub,     badge: volBadge,   badgeColor: volBColor, bar: volBarPct, barColor: volBarClr },
        ].map((card, i) => (
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
