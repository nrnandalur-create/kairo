import { useEffect, useMemo, useState } from 'react'

// Slim glass rail that fades + slides down from the top once the user scrolls
// past the MetricsBar hero. Mirrors the pattern serious finance sites use to
// keep "what am I looking at" + "where's the price" visible while reading
// deeper sections — Bloomberg, FT, Stratechery all do a variant of this.
//
// Renders nothing when no ticker is loaded. The only floating chrome on the
// page; everything else stays flat.
const APPEAR_AFTER_PX = 280

export default function StickyTickerBar({
  ticker, quote, profile, candles, synthetic, onJumpToTop,
}) {
  const [show, setShow] = useState(false)

  // RAF-throttled scroll listener — passive, cheap.
  useEffect(() => {
    if (!ticker || !quote) { setShow(false); return }
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setShow(window.scrollY > APPEAR_AFTER_PX))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [ticker, quote])

  // Sync a global data attribute so the sticky header can hide itself when
  // this rail is on screen — otherwise the rail sits on TOP of the header
  // (both anchored top: 0) and ~26px of header pokes out below (mobile) or
  // ~16px (desktop). Handled by a single transform rule in index.css.
  useEffect(() => {
    const root = document.documentElement
    if (show) root.setAttribute('data-scrolled-past-metrics', 'true')
    else root.removeAttribute('data-scrolled-past-metrics')
    return () => root.removeAttribute('data-scrolled-past-metrics')
  }, [show])

  // 70-bar sparkline from the last ~3 months of closes — pure SVG, no library.
  // Sized for the slim rail, deliberately understated.
  const sparklinePath = useMemo(() => {
    if (!candles?.length) return null
    const slice = candles.slice(-60).map(c => c.close)
    if (slice.length < 5) return null
    const min = Math.min(...slice)
    const max = Math.max(...slice)
    const range = max - min || 1
    const W = 72, H = 16
    return slice.map((p, i) => {
      const x = (i / (slice.length - 1)) * W
      const y = H - ((p - min) / range) * H
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
  }, [candles])

  if (!ticker || !quote) return null

  const up    = quote.dp > 0
  const down  = quote.dp < 0
  const color = up ? '#22B585' : down ? '#ef5454' : 'var(--c-text-faint)'
  const arrow = up ? '▲' : down ? '▼' : '◆'

  return (
    <div
      data-sticky-ticker
      aria-hidden={!show}
      className={`fixed top-0 left-0 right-0 lg:left-[60px] z-40 transition-[transform,opacity] duration-[280ms] ease-out ${
        show ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
      }`}
      style={{
        background:          'rgba(var(--c-glass-rgb), 0.94)',
        backdropFilter:      'blur(16px) saturate(150%)',
        WebkitBackdropFilter:'blur(16px) saturate(150%)',
        borderBottom:        '1px solid var(--c-glass-border)',
        // Hairline of verdict color along the very top edge — the only chrome.
        boxShadow:           `inset 0 1px 0 ${color}40`,
      }}
    >
      <button
        type="button"
        onClick={onJumpToTop}
        title="Back to top"
        aria-label={`${ticker} ${quote.c} — back to top`}
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center gap-3 cursor-pointer text-left active:scale-[0.997] transition-transform"
      >
        <span className="font-mono text-[12.5px] font-black tracking-[0.08em] text-[var(--c-text-strong)] tabular-nums shrink-0">
          {ticker}
        </span>
        {profile?.name && (
          <span className="text-[11px] text-[var(--c-text-faint)] truncate hidden sm:inline max-w-[200px]">
            {profile.name}
          </span>
        )}
        {sparklinePath && (
          <svg
            width="72" height="16" viewBox="0 0 72 16"
            className="shrink-0 hidden md:block ml-1 opacity-90"
            aria-hidden="true"
          >
            <path
              d={sparklinePath}
              fill="none"
              stroke={color}
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <div className="ml-auto flex items-center gap-3 tabular-nums shrink-0">
          <span className="font-mono text-[14px] font-bold text-[var(--c-text-strong)]">
            ${Number(quote.c).toFixed(2)}
          </span>
          <span className="font-mono text-[12px] font-bold" style={{ color }}>
            {arrow} {up ? '+' : ''}{Number(quote.dp).toFixed(2)}%
          </span>
          {synthetic && (
            <span
              title="Simulated data — real OHLC unavailable right now"
              className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#e3a234] hidden lg:inline border border-[#e3a234]/40 bg-[#e3a234]/10 px-1.5 py-0.5 rounded-full"
            >
              SIM
            </span>
          )}
        </div>
      </button>
    </div>
  )
}
