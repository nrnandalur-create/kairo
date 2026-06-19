// Decorative ambient backdrop for the landing hero.
// Pure CSS/SVG — no canvas, no rerenders, no extra deps.
// Radial mask keeps the center clear so the logo and search stay crisp.

// Two distinct y-value sequences over a 0–800 period (21 points, step 40).
// Each tells a different "market story" so the top and bottom lines feel
// like different stocks rather than one motif. Endpoints match for a
// seamless drift loop, and we draw the same period twice so we can
// translate the parent -50% without a visible seam.
const STEP = 40

// Climb → pullback → sharp drop → bounce → chop → strong rally → fade-out
const Y_TOP = [
  80, 70, 64, 52, 45, 58, 72, 84, 78, 65, 52,
  42, 48, 58, 50, 38, 28, 36, 48, 64, 80,
]

// Steady rise → blow-off top → crash → basing → grind higher
const Y_BOT = [
  62, 58, 50, 42, 36, 30, 24, 38, 56, 72, 80,
  74, 64, 58, 52, 48, 44, 40, 50, 58, 62,
]

function buildSegments(values, step) {
  const segs = []
  for (let i = 0; i < values.length - 1; i++) segs.push({
    x1: i * step,       y1: values[i],
    x2: (i + 1) * step, y2: values[i + 1],
    up: values[i + 1] < values[i],
  })
  // Repeat once at +800 so the parent w-[200%] can translate -50% with no seam
  const period = (values.length - 1) * step
  return segs.concat(segs.map(s => ({ ...s, x1: s.x1 + period, x2: s.x2 + period })))
}

const SEGS_TOP = buildSegments(Y_TOP, STEP)
const SEGS_BOT = buildSegments(Y_BOT, STEP)

// Diversified candles — each one a recognizable shape.
//   marubozu    : almost-full body, tiny wicks  (strong conviction)
//   hammer      : small body up top, long lower wick  (reversal off lows)
//   shootingStar: small body down low, long upper wick  (rejection at highs)
//   doji        : razor-thin body, balanced wicks  (indecision)
//   standard    : ~50–60% body, balanced wicks
//
// Each carries its own float amplitude (--float-amp) and animation duration
// so they bob asynchronously at different heights.
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
    case 'hammer':       return { wickTop:  0, wickBot: h,      bodyTop:  6, bodyH: 18      }
    case 'shootingStar': return { wickTop:  0, wickBot: h,      bodyTop: h - 24, bodyH: 18  }
    case 'doji':         return { wickTop:  0, wickBot: h,      bodyTop: h/2 - 4, bodyH: 8  }
    default:             return { wickTop:  6, wickBot: h -  6, bodyTop: h * 0.25, bodyH: h * 0.5 }
  }
}

// In-SVG glow: blurred SourceGraphic below, crisp original on top.
// Strokes/fills stay sharp while a true halo glows behind.
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
      <svg width="18" height={h} viewBox={`0 0 18 ${h}`} fill="none">
        <defs><Glow id={filterId} blur={3} /></defs>
        <g filter={`url(#${filterId})`}>
          <rect x="8.4" y={wickTop} width="1.2" height={wickBot - wickTop} fill={color} />
          <rect x="1"   y={bodyTop} width="16"  height={bodyH}             fill={color} rx="1.5" />
        </g>
      </svg>
    </div>
  )
}

const TICKER = [
  { sym: 'SPY',   px: '583.21', d: '+0.42%', up: true  },
  { sym: 'NVDA',  px: '712.30', d: '+2.41%', up: true  },
  { sym: 'AAPL',  px: '224.18', d: '+0.84%', up: true  },
  { sym: 'TSLA',  px: '248.10', d: '−1.12%', up: false },
  { sym: 'MSFT',  px: '418.95', d: '+0.32%', up: true  },
  { sym: 'GOOGL', px: '173.42', d: '−0.48%', up: false },
  { sym: 'META',  px: '512.18', d: '+1.56%', up: true  },
  { sym: 'AMZN',  px: '195.84', d: '+0.21%', up: true  },
  { sym: 'AMD',   px: '142.66', d: '−0.91%', up: false },
  { sym: 'QQQ',   px: '498.07', d: '+0.67%', up: true  },
]

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

export default function HeroMarketBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none [mask-image:radial-gradient(ellipse_at_center,transparent_28%,#000_76%)]"
    >
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

      {/* Top chart — multi-color segments, faster drift */}
      <div className="absolute top-[18%] left-0 w-[200%] animate-hero-drift">
        <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-44">
          <defs><Glow id="sg-top" blur={4} /></defs>
          <g filter="url(#sg-top)" opacity="1">
            {SEGS_TOP.map((s, i) => <SegmentLine key={i} {...s} width={2} />)}
          </g>
        </svg>
      </div>

      {/* Bottom chart — different story, slower drift, thinner stroke */}
      <div className="absolute bottom-[10%] left-0 w-[200%] animate-hero-drift-slow">
        <svg viewBox="0 0 1600 100" preserveAspectRatio="none" className="w-full h-40">
          <defs><Glow id="sg-bot" blur={3.5} /></defs>
          <g filter="url(#sg-bot)" opacity="0.85">
            {SEGS_BOT.map((s, i) => <SegmentLine key={i} {...s} width={1.6} />)}
          </g>
        </svg>
      </div>

      {/* Diversified floating candles */}
      {CANDLES.map((c, i) => <Candle key={i} {...c} />)}
    </div>
  )
}
