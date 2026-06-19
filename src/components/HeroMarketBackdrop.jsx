// Decorative ambient backdrop for the landing hero.
// Pure CSS/SVG — no canvas, no rerenders, no extra deps.
// Radial mask keeps the center clear so the logo and search stay crisp.

// ─── Sparkline data ──────────────────────────────────────────────────────────
// Two 41-point y-sequences over a 0–800 period (step 20 → denser, more
// realistic micro-movement). Endpoints loop, parent w-[200%] translates -50%
// for a seamless drift. Each tells a different market story so the top and
// bottom lines feel like different instruments, not one motif twice.
const STEP = 20

// Climb → pullback → blow-off top → drop → recovery → fade back to base.
const Y_TOP = [
  80, 78, 75, 73, 70, 68, 65, 62, 60, 58, 55,
  53, 56, 54, 58, 55, 60, 63, 67, 72, 76,
  78, 82, 86, 88, 90, 87, 84, 80, 76, 70,
  62, 55, 48, 42, 38, 42, 50, 60, 68, 80,
]

// Steady decline → capitulation → bounce → breakdown → V-recovery.
const Y_BOT = [
  62, 60, 58, 56, 54, 50, 48, 45, 42, 40, 38,
  35, 33, 30, 32, 35, 38, 42, 45, 48, 50,
  48, 50, 45, 42, 38, 34, 30, 28, 26, 24,
  28, 35, 42, 48, 52, 56, 58, 60, 61, 62,
]

function doublePeriod(values) {
  return [...values, ...values.slice(1)]
}

function valuesToSegments(values, step) {
  const segs = []
  for (let i = 0; i < values.length - 1; i++) segs.push({
    x1: i * step,       y1: values[i],
    x2: (i + 1) * step, y2: values[i + 1],
    up: values[i + 1] < values[i],
  })
  return segs
}

function valuesToAreaPath(values, step, baseY) {
  let d = `M0,${baseY}`
  values.forEach((y, i) => { d += ` L${i * step},${y}` })
  d += ` L${(values.length - 1) * step},${baseY} Z`
  return d
}

const Y_TOP_2 = doublePeriod(Y_TOP)
const Y_BOT_2 = doublePeriod(Y_BOT)
const SEGS_TOP = valuesToSegments(Y_TOP_2, STEP)
const SEGS_BOT = valuesToSegments(Y_BOT_2, STEP)
const AREA_TOP = valuesToAreaPath(Y_TOP_2, STEP, 120)
const AREA_BOT = valuesToAreaPath(Y_BOT_2, STEP, 100)

// ─── Candles ────────────────────────────────────────────────────────────────
// Six distinct shapes — marubozu / hammer / shooting star / doji / standards.
// Proportions match real OHLC candles: thin 1px wicks, narrower 10px bodies.
const CANDLES = [
  { left: '2%',  top: '12%', h: 100, type: 'marubozu',     bull: true,  amp: 14, dur: 6800,  delay: '0s'   },
  { left: '8%',  top: '54%', h: 86,  type: 'hammer',       bull: false, amp: 16, dur: 8400,  delay: '1.4s' },
  { left: '14%', top: '22%', h: 70,  type: 'doji',         bull: true,  amp:  9, dur: 5200,  delay: '2.6s' },
  { left: '85%', top: '14%', h: 108, type: 'marubozu',     bull: true,  amp: 18, dur: 7400,  delay: '0.8s' },
  { left: '92%', top: '46%', h: 92,  type: 'shootingStar', bull: false, amp: 12, dur: 9200,  delay: '2.0s' },
  { left: '95%', top: '74%', h: 78,  type: 'standard',     bull: true,  amp: 10, dur: 6300,  delay: '3.2s' },
]

function candleGeometry(type, h) {
  switch (type) {
    case 'marubozu':     return { wickTop:  4, wickBot: h -  4, bodyTop:  6, bodyH: h - 12 }
    case 'hammer':       return { wickTop:  0, wickBot: h,      bodyTop:  6, bodyH: 16     }
    case 'shootingStar': return { wickTop:  0, wickBot: h,      bodyTop: h - 22, bodyH: 16 }
    case 'doji':         return { wickTop:  0, wickBot: h,      bodyTop: h/2 - 3, bodyH: 6 }
    default:             return { wickTop:  6, wickBot: h -  6, bodyTop: h * 0.27, bodyH: h * 0.46 }
  }
}

// ─── Tickers ─────────────────────────────────────────────────────────────────
// Mega tech, semis, space + defense, ETFs, finance, fintech, consumer.
// SpaceX itself isn't public — included its real public peers (RKLB, LUNR,
// ASTS, SPCE) so the space theme reads correctly.
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

function Candle({ left, top, h, type, bull, amp, dur, delay }) {
  const color = bull ? '#1D9E75' : '#e24b4a'
  const { wickTop, wickBot, bodyTop, bodyH } = candleGeometry(type, h)
  const filterId = `cg-${type}-${bull ? 'b' : 'r'}-${h}`
  return (
    <div
      className="absolute animate-hero-float"
      style={{
        left, top,
        animationDelay: delay,
        animationDuration: `${dur}ms`,
        ['--float-amp']: `${amp}px`,
      }}
    >
      <svg width="14" height={h} viewBox={`0 0 14 ${h}`} fill="none">
        <defs><Glow id={filterId} blur={2.5} /></defs>
        <g filter={`url(#${filterId})`}>
          <rect x="6.5" y={wickTop} width="1" height={wickBot - wickTop} fill={color} />
          <rect x="2"   y={bodyTop} width="10" height={bodyH}            fill={color} rx="0.5" />
        </g>
      </svg>
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
  // Static grid that doesn't drift — feels like the chart viewport.
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {[20, 40, 60, 80].map(y => (
        <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y}
              stroke="#1D9E75" strokeOpacity="0.08" strokeWidth="0.08"
              strokeDasharray="0.5 1" vectorEffect="non-scaling-stroke" />
      ))}
      {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(x => (
        <line key={`v${x}`} x1={x} y1="0" x2={x} y2="100"
              stroke="#1D9E75" strokeOpacity="0.05" strokeWidth="0.08"
              strokeDasharray="0.5 1" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

function SegmentLine({ x1, y1, x2, y2, up, width }) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={up ? '#1D9E75' : '#e24b4a'}
      strokeWidth={width}
      strokeLinecap="round"
    />
  )
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function HeroMarketBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none [mask-image:radial-gradient(ellipse_at_center,transparent_28%,#000_76%)]"
    >
      {/* Static grid — feels like a chart viewport */}
      <ChartGrid />

      {/* Ticker tape — top edge */}
      <div className="absolute top-2 left-0 w-[200%] animate-hero-drift">
        <div
          className="flex items-center whitespace-nowrap opacity-90"
          style={{ textShadow: '0 0 8px rgba(29,158,117,0.35)' }}
        >
          {[...TICKER, ...TICKER].map((t, i) => (
            <TickerItem key={i} {...t} />
          ))}
        </div>
      </div>

      {/* Glowing horizon */}
      <div
        className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#1D9E75] to-transparent opacity-60"
        style={{ boxShadow: '0 0 12px 1px rgba(29,158,117,0.5)' }}
      />

      {/* Top chart — area fill + multi-color segments, faster drift */}
      <div className="absolute top-[16%] left-0 w-[200%] animate-hero-drift">
        <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-44">
          <defs>
            <linearGradient id="grad-top" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#1D9E75" stopOpacity="0.28" />
              <stop offset="60%"  stopColor="#1D9E75" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"    />
            </linearGradient>
            <Glow id="sg-top" blur={3.5} />
          </defs>
          <path d={AREA_TOP} fill="url(#grad-top)" />
          <g filter="url(#sg-top)">
            {SEGS_TOP.map((s, i) => <SegmentLine key={i} {...s} width={1.5} />)}
          </g>
        </svg>
      </div>

      {/* Bottom chart — different story, slower drift, thinner stroke */}
      <div className="absolute bottom-[10%] left-0 w-[200%] animate-hero-drift-slow">
        <svg viewBox="0 0 1600 100" preserveAspectRatio="none" className="w-full h-40">
          <defs>
            <linearGradient id="grad-bot" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#1D9E75" stopOpacity="0.22" />
              <stop offset="60%"  stopColor="#1D9E75" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#1D9E75" stopOpacity="0"    />
            </linearGradient>
            <Glow id="sg-bot" blur={3} />
          </defs>
          <path d={AREA_BOT} fill="url(#grad-bot)" />
          <g filter="url(#sg-bot)" opacity="0.9">
            {SEGS_BOT.map((s, i) => <SegmentLine key={i} {...s} width={1.25} />)}
          </g>
        </svg>
      </div>

      {/* Diversified floating candles */}
      {CANDLES.map((c, i) => <Candle key={i} {...c} />)}
    </div>
  )
}
