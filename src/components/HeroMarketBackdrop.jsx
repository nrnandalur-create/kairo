// Decorative ambient backdrop for the landing hero.
// Pure CSS/SVG — no canvas, no rerenders, no extra deps.
// Radial mask keeps the center clear so the logo and search stay crisp.

// Periodic over 0–800, repeated 800–1600. Container is w-[200%] and we
// translate -50% on loop, giving a seamless infinite drift.
const SPARK_TOP =
  'M0,80 L80,66 L160,94 L240,48 L320,72 L400,36 L480,62 L560,26 L640,58 L720,20 L800,80 ' +
  'L880,66 L960,94 L1040,48 L1120,72 L1200,36 L1280,62 L1360,26 L1440,58 L1520,20 L1600,80'

const SPARK_BOTTOM =
  'M0,60 L100,72 L200,40 L300,62 L400,28 L500,50 L600,78 L700,42 L800,60 ' +
  'L900,72 L1000,40 L1100,62 L1200,28 L1300,50 L1400,78 L1500,42 L1600,60'

const CANDLES = [
  { left: '2%',  top: '16%', h: 88, bodyTop: 22, bodyH: 38, bull: true,  delay: '0s'   },
  { left: '9%',  top: '58%', h: 76, bodyTop: 12, bodyH: 42, bull: false, delay: '1.4s' },
  { left: '15%', top: '26%', h: 64, bodyTop: 18, bodyH: 30, bull: true,  delay: '2.6s' },
  { left: '85%', top: '18%', h: 94, bodyTop: 28, bodyH: 38, bull: true,  delay: '0.8s' },
  { left: '92%', top: '50%', h: 78, bodyTop: 16, bodyH: 44, bull: false, delay: '2.0s' },
  { left: '95%', top: '76%', h: 70, bodyTop: 10, bodyH: 38, bull: true,  delay: '3.2s' },
]

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

// SVG glow filter — blurred copy below, crisp SourceGraphic on top.
// Keeps strokes/fills sharp while emitting a true halo.
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

function Candle({ left, top, h, bodyTop, bodyH, bull, delay }) {
  const color = bull ? '#1D9E75' : '#e24b4a'
  return (
    <div
      className="absolute animate-hero-float"
      style={{ left, top, animationDelay: delay }}
    >
      <svg width="16" height={h} viewBox={`0 0 16 ${h}`} fill="none">
        <defs><Glow id={`cg-${bull ? 'b' : 'r'}-${h}-${bodyH}`} blur={3} /></defs>
        <g filter={`url(#cg-${bull ? 'b' : 'r'}-${h}-${bodyH})`}>
          <rect x="7.4" y="0"       width="1.2" height={h}     fill={color} />
          <rect x="0.5" y={bodyTop} width="15"  height={bodyH} fill={color} rx="1" />
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
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#1D9E75] to-transparent opacity-60"
           style={{ boxShadow: '0 0 12px 1px rgba(29,158,117,0.5)' }} />

      {/* Top sparkline — drifts left, faster */}
      <div className="absolute top-[18%] left-0 w-[200%] animate-hero-drift">
        <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-44">
          <defs><Glow id="sg-top" blur={4} /></defs>
          <path
            d={SPARK_TOP}
            stroke="#1D9E75"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#sg-top)"
            opacity="1"
          />
        </svg>
      </div>

      {/* Bottom sparkline — drifts left, slower */}
      <div className="absolute bottom-[10%] left-0 w-[200%] animate-hero-drift-slow">
        <svg viewBox="0 0 1600 100" preserveAspectRatio="none" className="w-full h-40">
          <defs><Glow id="sg-bot" blur={3.5} /></defs>
          <path
            d={SPARK_BOTTOM}
            stroke="#1D9E75"
            strokeWidth="1.75"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#sg-bot)"
            opacity="0.85"
          />
        </svg>
      </div>

      {/* Floating candles at the edges */}
      {CANDLES.map((c, i) => <Candle key={i} {...c} />)}
    </div>
  )
}
