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

// Scaled up + tighter to the edges so a bigger size doesn't crowd the center.
const CANDLES = [
  { left: '2%',  top: '10%', h: 88, bodyTop: 22, bodyH: 38, bull: true,  delay: '0s'   },
  { left: '8%',  top: '54%', h: 76, bodyTop: 12, bodyH: 42, bull: false, delay: '1.4s' },
  { left: '14%', top: '22%', h: 64, bodyTop: 18, bodyH: 30, bull: true,  delay: '2.6s' },
  { left: '85%', top: '14%', h: 94, bodyTop: 28, bodyH: 38, bull: true,  delay: '0.8s' },
  { left: '92%', top: '48%', h: 78, bodyTop: 16, bodyH: 44, bull: false, delay: '2.0s' },
  { left: '95%', top: '74%', h: 70, bodyTop: 10, bodyH: 38, bull: true,  delay: '3.2s' },
]

function Candle({ left, top, h, bodyTop, bodyH, bull, delay }) {
  const color = bull ? '#1D9E75' : '#e24b4a'
  // Soft halo around each candle, color-matched to bull/bear
  const glow = bull
    ? 'drop-shadow(0 0 10px rgba(29,158,117,0.55)) drop-shadow(0 0 4px rgba(29,158,117,0.45))'
    : 'drop-shadow(0 0 10px rgba(226,75,74,0.50)) drop-shadow(0 0 4px rgba(226,75,74,0.45))'
  return (
    <div
      className="absolute animate-hero-float"
      style={{ left, top, animationDelay: delay, filter: glow }}
    >
      <svg width="16" height={h} viewBox={`0 0 16 ${h}`} fill="none">
        <rect x="7.4" y="0" width="1.2" height={h} fill={color} opacity="0.7" />
        <rect x="0.5" y={bodyTop} width="15" height={bodyH} fill={color} opacity="0.8" rx="1" />
      </svg>
    </div>
  )
}

export default function HeroMarketBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none [mask-image:radial-gradient(ellipse_at_center,transparent_30%,#000_78%)]"
    >
      {/* Glowing horizon line */}
      <div
        className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-[#1D9E75]/40 to-transparent"
        style={{ filter: 'drop-shadow(0 0 6px rgba(29,158,117,0.45))' }}
      />

      {/* Top sparkline — drifts left, faster */}
      <div
        className="absolute top-[10%] left-0 w-[200%] animate-hero-drift"
        style={{ filter: 'drop-shadow(0 0 8px rgba(29,158,117,0.55)) drop-shadow(0 0 3px rgba(29,158,117,0.5))' }}
      >
        <svg viewBox="0 0 1600 120" preserveAspectRatio="none" className="w-full h-44">
          <path
            d={SPARK_TOP}
            stroke="#1D9E75"
            strokeWidth="1.75"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.45"
          />
        </svg>
      </div>

      {/* Bottom sparkline — drifts left, slower and softer */}
      <div
        className="absolute bottom-[8%] left-0 w-[200%] animate-hero-drift-slow"
        style={{ filter: 'drop-shadow(0 0 7px rgba(29,158,117,0.45))' }}
      >
        <svg viewBox="0 0 1600 100" preserveAspectRatio="none" className="w-full h-40">
          <path
            d={SPARK_BOTTOM}
            stroke="#1D9E75"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.3"
          />
        </svg>
      </div>

      {/* Floating candles at the edges */}
      {CANDLES.map((c, i) => <Candle key={i} {...c} />)}
    </div>
  )
}
