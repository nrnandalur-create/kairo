// Decorative ambient backdrop for the landing hero.
// Pure CSS/SVG — no canvas, no rerenders, no extra deps.
// Radial mask keeps the center clear so the logo and search stay crisp.

// Path data is periodic over the 0–800 range, then repeated 800–1600.
// The container is w-[200%] and we translate -50% on loop, so it scrolls forever
// with no visible seam.
const SPARK_TOP =
  'M0,80 L80,66 L160,94 L240,48 L320,72 L400,36 L480,62 L560,26 L640,58 L720,20 L800,80 ' +
  'L880,66 L960,94 L1040,48 L1120,72 L1200,36 L1280,62 L1360,26 L1440,58 L1520,20 L1600,80'

const SPARK_BOTTOM =
  'M0,60 L100,72 L200,40 L300,62 L400,28 L500,50 L600,78 L700,42 L800,60 ' +
  'L900,72 L1000,40 L1100,62 L1200,28 L1300,50 L1400,78 L1500,42 L1600,60'

const CANDLES = [
  { left: '3%',  top: '14%', h: 56, bodyTop: 14, bodyH: 24, bull: true,  delay: '0s'   },
  { left: '10%', top: '52%', h: 48, bodyTop: 8,  bodyH: 26, bull: false, delay: '1.4s' },
  { left: '17%', top: '24%', h: 42, bodyTop: 12, bodyH: 18, bull: true,  delay: '2.6s' },
  { left: '82%', top: '18%', h: 60, bodyTop: 18, bodyH: 24, bull: true,  delay: '0.8s' },
  { left: '90%', top: '46%', h: 50, bodyTop: 10, bodyH: 28, bull: false, delay: '2.0s' },
  { left: '95%', top: '72%', h: 44, bodyTop: 6,  bodyH: 24, bull: true,  delay: '3.2s' },
]

function Candle({ left, top, h, bodyTop, bodyH, bull, delay }) {
  const color = bull ? '#1D9E75' : '#e24b4a'
  return (
    <div
      className="absolute animate-hero-float"
      style={{ left, top, animationDelay: delay }}
    >
      <svg width="10" height={h} viewBox={`0 0 10 ${h}`} fill="none">
        <rect x="4.6" y="0" width="0.8" height={h} fill={color} opacity="0.45" />
        <rect x="0.5" y={bodyTop} width="9" height={bodyH} fill={color} opacity="0.55" rx="0.6" />
      </svg>
    </div>
  )
}

export default function HeroMarketBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none [mask-image:radial-gradient(ellipse_at_center,transparent_22%,#000_72%)]"
    >
      {/* Faint horizon line */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#1D9E75]/20 to-transparent" />

      {/* Top sparkline — drifts left, faster */}
      <div className="absolute top-[14%] left-0 w-[200%] animate-hero-drift">
        <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-32">
          <path
            d={SPARK_TOP}
            stroke="#1D9E75"
            strokeWidth="1.25"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.22"
          />
        </svg>
      </div>

      {/* Bottom sparkline — drifts left, slower and dimmer */}
      <div className="absolute bottom-[12%] left-0 w-[200%] animate-hero-drift-slow">
        <svg viewBox="0 0 1600 100" preserveAspectRatio="none" className="w-full h-28">
          <path
            d={SPARK_BOTTOM}
            stroke="#1D9E75"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.14"
          />
        </svg>
      </div>

      {/* Floating candles at the edges */}
      {CANDLES.map((c, i) => <Candle key={i} {...c} />)}
    </div>
  )
}
