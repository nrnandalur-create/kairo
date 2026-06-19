// Decorative ambient backdrop for the landing hero.
// Pure CSS/SVG — no canvas, no rerenders, no extra deps.
// Layered composition: dominant mountain chart, two watchlist tiles in
// opposite corners, a candle-sequence "snapshot," a top ticker tape,
// faint static grid, and a glowing horizon. Tight radial mask keeps the
// center clear so the logo and search stay crisp.

// ─── Mountain chart data ────────────────────────────────────────────────────
const STEP = 20

// Climb → pullback → blow-off top → drop → V-recovery.
const Y_TOP = [
  80, 78, 75, 73, 70, 68, 65, 62, 60, 58, 55,
  53, 56, 54, 58, 55, 60, 63, 67, 72, 76,
  78, 82, 86, 88, 90, 87, 84, 80, 76, 70,
  62, 55, 48, 42, 38, 42, 50, 60, 68, 80,
]

// Steady decline → capitulation → bounce → breakdown → recovery.
const Y_BOT = [
  62, 60, 58, 56, 54, 50, 48, 45, 42, 40, 38,
  35, 33, 30, 32, 35, 38, 42, 45, 48, 50,
  48, 50, 45, 42, 38, 34, 30, 28, 26, 24,
  28, 35, 42, 48, 52, 56, 58, 60, 61, 62,
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

const Y_TOP_2 = doublePeriod(Y_TOP)
const Y_BOT_2 = doublePeriod(Y_BOT)
const LINE_TOP = smoothLinePath(Y_TOP_2, STEP)
const LINE_BOT = smoothLinePath(Y_BOT_2, STEP)
const AREA_TOP = smoothAreaPath(Y_TOP_2, STEP, 120)
const AREA_BOT = smoothAreaPath(Y_BOT_2, STEP, 100)

// ─── Watchlist tile chart data ──────────────────────────────────────────────
// 15-point sequences for the in-tile mini mountain charts (viewBox y: 0–50).
const TILE_UP = [40, 38, 36, 35, 33, 30, 32, 30, 27, 25, 22, 20, 18, 15, 12]
const TILE_DN = [10, 12, 13, 16, 14, 18, 21, 19, 24, 27, 26, 30, 33, 35, 38]
const TILE_STEP = 10
const TILE_W = (TILE_UP.length - 1) * TILE_STEP

// ─── Candle cluster ─────────────────────────────────────────────────────────
// 6 candles in a row reading as a recognizable bullish reversal pattern:
// pause → strong bull → doji → bear pullback → hammer rejection → continuation.
const CLUSTER = [
  { type: 'standard',     bull: true,  h: 60 },
  { type: 'marubozu',     bull: true,  h: 76 },
  { type: 'doji',         bull: true,  h: 54 },
  { type: 'standard',     bull: false, h: 50 },
  { type: 'hammer',       bull: true,  h: 64 },
  { type: 'marubozu',     bull: true,  h: 78 },
]

function candleGeometry(type, h) {
  switch (type) {
    case 'marubozu':     return { wickTop:  4, wickBot: h -  4, bodyTop:  6,        bodyH: h - 12 }
    case 'hammer':       return { wickTop:  0, wickBot: h,      bodyTop:  6,        bodyH: 16     }
    case 'shootingStar': return { wickTop:  0, wickBot: h,      bodyTop: h - 22,    bodyH: 16     }
    case 'doji':         return { wickTop:  0, wickBot: h,      bodyTop: h/2 - 3,   bodyH: 6      }
    default:             return { wickTop:  6, wickBot: h -  6, bodyTop: h * 0.27,  bodyH: h * 0.46 }
  }
}

// ─── Tickers ─────────────────────────────────────────────────────────────────
// SpaceX isn't public — using its real public peers (RKLB, LUNR, ASTS, SPCE).
const TICKER = [
  { sym: 'AAPL',  px: '224.18', d: '+0.84%', up: true  },
  { sym: 'MSFT',  px: '418.95', d: '+0.32%', up: true  },
  { sym: 'NVDA',  px: '712.30', d: '+2.41%', up: true  },
  { sym: 'GOOGL', px: '173.42', d: '−0.48%', up: false },
  { sym: 'META',  px: '512.18', d: '+1.56%', up: true  },
  { sym: 'AMZN',  px: '195.84', d: '+0.21%', up: true  },
  { sym: 'TSLA',  px: '248.10', d: '−1.12%', up: false },
  { sym: 'AMD',   px: '142.66', d: '−0.91%', up: false },
  { sym: 'AVGO',  px: '174.30', d: '+0.55%', up: true  },
  { sym: 'TSM',   px: '186.42', d: '+1.04%', up: true  },
  { sym: 'RKLB',  px:  '12.84', d: '+3.12%', up: true  },
  { sym: 'LUNR',  px:   '5.40', d: '+5.23%', up: true  },
  { sym: 'ASTS',  px:  '24.62', d: '−1.81%', up: false },
  { sym: 'SPCE',  px:   '4.92', d: '+0.68%', up: true  },
  { sym: 'LMT',   px: '472.18', d: '−0.22%', up: false },
  { sym: 'BA',    px: '184.30', d: '+0.96%', up: true  },
  { sym: 'SPY',   px: '583.21', d: '+0.42%', up: true  },
  { sym: 'QQQ',   px: '498.07', d: '+0.67%', up: true  },
  { sym: 'IWM',   px: '218.40', d: '−0.34%', up: false },
  { sym: 'JPM',   px: '232.18', d: '+0.18%', up: true  },
  { sym: 'V',     px: '298.62', d: '+0.41%', up: true  },
  { sym: 'COIN',  px: '218.92', d: '+2.78%', up: true  },
  { sym: 'PLTR',  px:  '68.42', d: '+1.92%', up: true  },
  { sym: 'NFLX',  px: '742.30', d: '+1.86%', up: true  },
]

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

function ClusterCandle({ type, bull, h, idx }) {
  const color = bull ? '#1D9E75' : '#e24b4a'
  const { wickTop, wickBot, bodyTop, bodyH } = candleGeometry(type, h)
  return (
    <div
      className="animate-hero-float shrink-0"
      style={{
        animationDelay: `${idx * 0.35}s`,
        animationDuration: `${5400 + idx * 280}ms`,
        ['--float-amp']: '3px',
      }}
    >
      <svg width="14" height={h} viewBox={`0 0 14 ${h}`} fill="none">
        <defs><Glow id={`cl-${idx}`} blur={2.5} /></defs>
        <g filter={`url(#cl-${idx})`}>
          <rect x="6.5" y={wickTop} width="1"  height={wickBot - wickTop} fill={color} />
          <rect x="2"   y={bodyTop} width="10" height={bodyH}             fill={color} rx="0.5" />
        </g>
      </svg>
    </div>
  )
}

function WatchlistTile({ sym, name, px, d, up, values, position, className = '' }) {
  const color = up ? '#1D9E75' : '#e24b4a'
  const linePath = smoothLinePath(values, TILE_STEP)
  const areaPath = smoothAreaPath(values, TILE_STEP, 50)
  const gradId   = `tile-${sym}-grad`
  const glowId   = `tile-${sym}-glow`
  return (
    <div className={`absolute ${className}`} style={position}>
      <div
        className="rounded-xl border border-[#1a2e1f]/80 bg-[#0a100c]/85 backdrop-blur-sm px-3.5 py-3 w-[168px]"
        style={{
          boxShadow: `0 0 32px -4px ${up ? 'rgba(29,158,117,0.25)' : 'rgba(226,75,74,0.22)'}, inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 24px -8px rgba(0,0,0,0.5)`,
        }}
      >
        <div className="flex items-baseline justify-between mb-0.5">
          <span className="font-mono text-[11px] font-bold text-[#d1d9d5] tracking-[0.1em]">{sym}</span>
          <span className="font-mono text-[10px] font-semibold" style={{ color }}>
            {up ? '▲' : '▼'} {d}
          </span>
        </div>
        <div className="text-[9px] uppercase tracking-[0.15em] text-[#4b6358] mb-1.5">{name}</div>
        <div className="font-mono text-[15px] font-semibold text-white mb-2">${px}</div>
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
      </div>
    </div>
  )
}

function TickerItem({ sym, px, d, up }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[11px] tracking-wider">
      <span className="text-[#d1d9d5] font-semibold">{sym}</span>
      <span className="text-[#4b6358]">{px}</span>
      <span className={up ? 'text-[#1D9E75]' : 'text-[#e24b4a]'}>
        {up ? '▲' : '▼'} {d}
      </span>
      <span className="text-[#1a2e1f] px-3">•</span>
    </span>
  )
}

function ChartGrid() {
  // Static grid — feels like a chart viewport behind the prices.
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
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      {/* Layer 1: ambient charts + grid — masked so they fade away from the center */}
      <div
        className="absolute inset-0 [mask-image:radial-gradient(ellipse_46%_58%_at_center,transparent_0%,#000_70%)]"
      >
        <ChartGrid />

        {/* Glowing horizon */}
        <div
          className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#1D9E75] to-transparent opacity-70"
          style={{ boxShadow: '0 0 14px 1px rgba(29,158,117,0.55)' }}
        />

        {/* Dominant mountain chart — green, top */}
        <div className="absolute top-[14%] left-0 w-[200%] animate-hero-drift">
          <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-48">
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

        {/* Secondary mountain chart — red, bottom, slower */}
        <div className="absolute bottom-[8%] left-0 w-[200%] animate-hero-drift-slow">
          <svg viewBox="0 0 1600 100" preserveAspectRatio="none" className="w-full h-40">
            <defs>
              <linearGradient id="grad-bot" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#e24b4a" stopOpacity="0.32" />
                <stop offset="55%"  stopColor="#e24b4a" stopOpacity="0.09" />
                <stop offset="100%" stopColor="#e24b4a" stopOpacity="0"    />
              </linearGradient>
              <Glow id="sg-bot" blur={2.5} />
            </defs>
            <path d={AREA_BOT} fill="url(#grad-bot)" />
            <path
              d={LINE_BOT}
              stroke="#e24b4a"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#sg-bot)"
              opacity="0.92"
            />
          </svg>
        </div>
      </div>

      {/* Layer 2: ticker tape — fully visible, not masked */}
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

      {/* Layer 3: watchlist tiles (corners) and candle cluster — full visibility */}
      <WatchlistTile
        position={{ top: '34px', left: '24px' }}
        sym="NVDA"  name="NVIDIA Corp"
        px="712.30" d="+2.41%" up={true}
        values={TILE_UP}
        className="hidden lg:block"
      />
      <WatchlistTile
        position={{ bottom: '24px', right: '24px' }}
        sym="TSLA"  name="Tesla Inc"
        px="248.10" d="−1.12%" up={false}
        values={TILE_DN}
        className="hidden lg:block"
      />

      {/* Candle cluster — bottom-left, drifts subtly with the hero scroll feel */}
      <div className="absolute left-[28px] bottom-[36px] hidden md:flex items-end gap-[3px]">
        {CLUSTER.map((c, i) => <ClusterCandle key={i} {...c} idx={i} />)}
      </div>
    </div>
  )
}
