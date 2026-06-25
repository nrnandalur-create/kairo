// Decorative ambient backdrop for the landing hero.
// Pure CSS/SVG — no canvas, no rerenders, no extra deps.
//
// Composition reads like a real trading interface:
//   ▸ ticker tape (with exchange tags) drifts across the top
//   ▸ LIVE indicator (pulsing dot + NYSE clock) in the top-right
//   ▸ three watchlist tiles in the corners (NVDA / SPY / TSLA) — each
//     with exchange tag, company name, price, delta, mini mountain
//     chart, and volume
//   ▸ a dominant green mountain chart spans the middle with a price
//     axis on the right and a volume histogram beneath
//   ▸ static grid + glowing horizon anchor the viewport
// A tight elliptical mask keeps the center clear so the logo, tagline,
// search, and recent chips stay crisp.

// ─── Main chart data ────────────────────────────────────────────────────────
const STEP = 20

// Climb → pullback → blow-off top → drop → V-recovery.
const Y_TOP = [
  80, 78, 75, 73, 70, 68, 65, 62, 60, 58, 55,
  53, 56, 54, 58, 55, 60, 63, 67, 72, 76,
  78, 82, 86, 88, 90, 87, 84, 80, 76, 70,
  62, 55, 48, 42, 38, 42, 50, 60, 68, 80,
]

function doublePeriod(values) {
  return [...values, ...values.slice(1)]
}

// Catmull-Rom to cubic Bezier — smooth curve passing through every point.
function smoothLinePath(values, step) {
  if (values.length < 2) return ''
  const pts = values.map((y, i) => [i * step, y])
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || pts[i + 1]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`
  }
  return d
}

function smoothAreaPath(values, step, baseY) {
  const line = smoothLinePath(values, step)
  const lastX = (values.length - 1) * step
  return `${line} L${lastX},${baseY} L0,${baseY} Z`
}

// Volume bars derived from price moves: bigger moves → taller bars,
// up-day green, down-day red. Deterministic noise varies the heights.
function buildVolumes(values, step) {
  const out = []
  for (let i = 0; i < values.length - 1; i++) {
    const diff = values[i + 1] - values[i]
    const noise = ((i * 13 + 7) % 11) * 0.65
    out.push({
      x: i * step,
      h: Math.max(3.5, Math.abs(diff) * 0.75 + noise + 2.5),
      up: diff < 0, // y inverted in SVG: lower y = higher price
    })
  }
  return out
}

const Y_TOP_2 = doublePeriod(Y_TOP)
const LINE_TOP = smoothLinePath(Y_TOP_2, STEP)
const AREA_TOP = smoothAreaPath(Y_TOP_2, STEP, 120)
const VOLS = buildVolumes(Y_TOP_2, STEP)

// ─── Watchlist tile chart data ──────────────────────────────────────────────
const TILE_STEP = 10
const TILE_NVDA = [40, 38, 36, 35, 33, 30, 32, 30, 27, 25, 22, 20, 18, 15, 12]
const TILE_SPY  = [32, 31, 30, 29, 30, 28, 27, 28, 25, 24, 23, 22, 20, 19, 18]
const TILE_TSLA = [10, 12, 14, 13, 16, 18, 21, 20, 24, 27, 26, 30, 33, 35, 38]
const TILE_W    = (TILE_NVDA.length - 1) * TILE_STEP

// ─── Tickers ────────────────────────────────────────────────────────────────
// Exchange tag prepended: NDQ for Nasdaq, NYSE for NYSE listings.
// SpaceX itself isn't public — using its real public peers.
const TICKER = [
  { ex: 'NDQ',  sym: 'AAPL',  px: '224.18', d: '+0.84%', up: true  },
  { ex: 'NDQ',  sym: 'MSFT',  px: '418.95', d: '+0.32%', up: true  },
  { ex: 'NDQ',  sym: 'NVDA',  px: '712.30', d: '+2.41%', up: true  },
  { ex: 'NDQ',  sym: 'GOOGL', px: '173.42', d: '−0.48%', up: false },
  { ex: 'NDQ',  sym: 'META',  px: '512.18', d: '+1.56%', up: true  },
  { ex: 'NDQ',  sym: 'AMZN',  px: '195.84', d: '+0.21%', up: true  },
  { ex: 'NDQ',  sym: 'TSLA',  px: '248.10', d: '−1.12%', up: false },
  { ex: 'NDQ',  sym: 'AMD',   px: '142.66', d: '−0.91%', up: false },
  { ex: 'NDQ',  sym: 'AVGO',  px: '174.30', d: '+0.55%', up: true  },
  { ex: 'NYSE', sym: 'TSM',   px: '186.42', d: '+1.04%', up: true  },
  { ex: 'NDQ',  sym: 'RKLB',  px:  '12.84', d: '+3.12%', up: true  },
  { ex: 'NDQ',  sym: 'LUNR',  px:   '5.40', d: '+5.23%', up: true  },
  { ex: 'NDQ',  sym: 'ASTS',  px:  '24.62', d: '−1.81%', up: false },
  { ex: 'NYSE', sym: 'SPCE',  px:   '4.92', d: '+0.68%', up: true  },
  { ex: 'NYSE', sym: 'LMT',   px: '472.18', d: '−0.22%', up: false },
  { ex: 'NYSE', sym: 'BA',    px: '184.30', d: '+0.96%', up: true  },
  { ex: 'NYSE', sym: 'SPY',   px: '583.21', d: '+0.42%', up: true  },
  { ex: 'NDQ',  sym: 'QQQ',   px: '498.07', d: '+0.67%', up: true  },
  { ex: 'NYSE', sym: 'IWM',   px: '218.40', d: '−0.34%', up: false },
  { ex: 'NYSE', sym: 'JPM',   px: '232.18', d: '+0.18%', up: true  },
  { ex: 'NYSE', sym: 'V',     px: '298.62', d: '+0.41%', up: true  },
  { ex: 'NDQ',  sym: 'COIN',  px: '218.92', d: '+2.78%', up: true  },
  { ex: 'NYSE', sym: 'PLTR',  px:  '68.42', d: '+1.92%', up: true  },
  { ex: 'NDQ',  sym: 'NFLX',  px: '742.30', d: '+1.86%', up: true  },
]

// Price levels for the right-side axis (rendered top → bottom).
const PRICE_LEVELS = ['590.00', '585.00', '580.00', '575.00', '570.00']

// ─── Building blocks ────────────────────────────────────────────────────────
function Glow({ id, blur = 4 }) {
  return (
    <filter id={id} x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
}

function LiveIndicator() {
  return (
    <div className="absolute top-2.5 right-4 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full bg-[#1D9E75] animate-live-pulse" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#1D9E75]" />
      </span>
      <span className="text-[#1D9E75] font-semibold">Live</span>
      <span className="text-[#1a2e1f]">·</span>
      <span className="text-[var(--c-text-faint)]">NYSE 14:32 ET</span>
    </div>
  )
}

function PriceAxis() {
  return (
    <div className="absolute right-3 top-[20%] bottom-[36%] hidden md:flex flex-col justify-between">
      {PRICE_LEVELS.map(p => (
        <div key={p} className="flex items-center gap-1.5 justify-end">
          <span className="font-mono text-[9.5px] tabular-nums tracking-tight text-[var(--c-text-faint)]">${p}</span>
          <span className="w-1.5 h-px bg-[#1a2e1f]" />
        </div>
      ))}
    </div>
  )
}

function WatchlistTile({ sym, name, ex, px, vol, d, up, values, position, className = '' }) {
  const color = up ? '#1D9E75' : '#e24b4a'
  const linePath = smoothLinePath(values, TILE_STEP)
  const areaPath = smoothAreaPath(values, TILE_STEP, 50)
  const gradId   = `tile-${sym}-grad`
  const glowId   = `tile-${sym}-glow`
  return (
    <div className={`absolute ${className}`} style={position}>
      <div
        className="glass-tile rounded-xl px-3.5 pt-2.5 pb-3 w-[180px]"
        style={{
          boxShadow: `0 0 32px -4px ${up ? 'rgba(29,158,117,0.22)' : 'rgba(226,75,74,0.20)'}, inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 24px -8px rgba(0,0,0,0.55)`,
        }}
      >
        {/* Header: ticker + exchange tag · delta */}
        <div className="flex items-baseline justify-between mb-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[11.5px] font-bold text-[var(--c-text)] tracking-[0.08em]">{sym}</span>
            <span className="font-mono text-[8.5px] font-semibold tracking-[0.12em] text-[var(--c-text-faint)]">{ex}</span>
          </div>
          <span className="font-mono text-[10px] font-semibold tabular-nums" style={{ color }}>
            {up ? '▲' : '▼'} {d}
          </span>
        </div>
        <div className="text-[8.5px] uppercase tracking-[0.16em] text-[var(--c-text-fainter)] mb-1.5">{name}</div>
        <div className="font-mono text-[15.5px] font-semibold text-white tabular-nums mb-2">${px}</div>

        {/* Mini mountain chart */}
        <svg viewBox={`0 0 ${TILE_W} 50`} preserveAspectRatio="none" className="w-full h-8">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} stopOpacity="0"   />
            </linearGradient>
            <Glow id={glowId} blur={1.5} />
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path
            d={linePath}
            stroke={color}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${glowId})`}
          />
        </svg>

        {/* Footer: volume */}
        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--c-border)]/60">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-[var(--c-text-fainter)]">Vol</span>
          <span className="font-mono text-[9.5px] tabular-nums text-[var(--c-text-faint)]">{vol}</span>
        </div>
      </div>
    </div>
  )
}

function TickerItem({ ex, sym, px, d, up }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[11px] tracking-wider">
      <span className="text-[var(--c-text-fainter)] text-[9px] font-semibold tracking-[0.15em]">{ex}</span>
      <span className="text-[var(--c-text)] font-semibold">{sym}</span>
      <span className="text-[var(--c-text-faint)] tabular-nums">{px}</span>
      <span className={`tabular-nums ${up ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}`}>
        {up ? '▲' : '▼'} {d}
      </span>
      <span className="text-[#1a2e1f] px-3">·</span>
    </span>
  )
}

function ChartGrid() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {[20, 40, 60, 80].map(y => (
        <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y}
              stroke="#1D9E75" strokeOpacity="0.1" strokeWidth="0.08"
              strokeDasharray="0.5 1" vectorEffect="non-scaling-stroke" />
      ))}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(x => (
        <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100"
              stroke="#1D9E75" strokeOpacity="0.06" strokeWidth="0.08"
              strokeDasharray="0.5 1" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function HeroMarketBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Layer 1: ambient chart + grid + horizon — masked so they fade away from the center */}
      <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_46%_58%_at_center,transparent_0%,#000_70%)]">
        <ChartGrid />

        {/* Glowing horizon */}
        <div
          className="absolute inset-x-0 top-[58%] h-px bg-gradient-to-r from-transparent via-[#1D9E75] to-transparent opacity-70"
          style={{ boxShadow: '0 0 14px 1px rgba(29,158,117,0.55)' }}
        />

        {/* Dominant green mountain chart */}
        <div className="absolute top-[14%] left-0 w-[200%] animate-hero-drift">
          <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-44">
            <defs>
              <linearGradient id="grad-top" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#1D9E75" stopOpacity="0.42" />
                <stop offset="55%"  stopColor="#1D9E75" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"    />
              </linearGradient>
              <Glow id="sg-top" blur={3} />
            </defs>
            <path d={AREA_TOP} fill="url(#grad-top)" />
            <path
              d={LINE_TOP}
              stroke="#1D9E75"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#sg-top)"
            />
          </svg>
        </div>

        {/* Volume histogram — drifts with the chart at the same speed */}
        <div className="absolute top-[62%] left-0 w-[200%] animate-hero-drift">
          <svg viewBox="0 0 1600 30" preserveAspectRatio="none" className="w-full h-12">
            {VOLS.map((v, i) => (
              <rect
                key={i}
                x={v.x - 4}
                y={30 - v.h}
                width="8"
                height={v.h}
                fill={v.up ? '#1D9E75' : '#e24b4a'}
                opacity={v.up ? 0.55 : 0.5}
                rx="1"
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Layer 2: ticker tape — fully visible at the top edge */}
      <div className="absolute top-2 left-0 w-[200%] animate-hero-drift">
        <div
          className="flex items-center whitespace-nowrap"
          style={{ textShadow: '0 0 8px rgba(29,158,117,0.4)' }}
        >
          {[...TICKER, ...TICKER].map((t, i) => (
            <TickerItem key={i} {...t} />
          ))}
        </div>
      </div>

      {/* Layer 3: pro UI chrome */}
      <LiveIndicator />
      <PriceAxis />

      {/* Watchlist tiles in the corners */}
      <WatchlistTile
        position={{ top: '30px', left: '20px' }}
        sym="NVDA"  name="NVIDIA Corp"   ex="NDQ"
        px="712.30" vol="42.3M" d="+2.41%" up={true}
        values={TILE_NVDA}
        className="hidden lg:block"
      />
      <WatchlistTile
        position={{ bottom: '20px', left: '20px' }}
        sym="SPY"   name="SPDR S&P 500"  ex="NYSE"
        px="583.21" vol="8.2M"  d="+0.42%" up={true}
        values={TILE_SPY}
        className="hidden lg:block"
      />
      <WatchlistTile
        position={{ bottom: '20px', right: '20px' }}
        sym="TSLA"  name="Tesla Inc"     ex="NDQ"
        px="248.10" vol="89.1M" d="−1.12%" up={false}
        values={TILE_TSLA}
        className="hidden lg:block"
      />
    </div>
  )
}
