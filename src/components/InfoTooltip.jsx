import { useEffect, useId, useRef, useState } from 'react'

// Small "?" affordance that reveals a methodology / source explainer on hover
// or keyboard focus. Use on data-panel titles where the source isn't obvious.
//
// Behaviour: the first tooltip in a session waits 600ms before appearing
// (intentional reveal, prevents accidental triggering). After that, all
// subsequent tooltips appear instantly — the Linear / Vercel feel where the
// user has signalled they're tooltip-aware. The "warm" flag is window-level
// and resets on a hard reload.
//
// Usage:
//   <h3 className="...">AI Analysis <InfoTooltip>Built on Groq LLaMA over technical indicators + recent price action.</InfoTooltip></h3>

const INITIAL_DELAY_MS = 600
const FLAG = '__kairo_tip_warm'

export default function InfoTooltip({ children, label = 'About this data', side = 'bottom' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const timerRef = useRef(null)

  // Cleanup any pending open-timer on unmount.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const scheduleOpen = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const warm = typeof window !== 'undefined' && window[FLAG]
    if (warm) {
      setOpen(true)
      return
    }
    timerRef.current = setTimeout(() => {
      setOpen(true)
      if (typeof window !== 'undefined') window[FLAG] = true
    }, INITIAL_DELAY_MS)
  }
  const cancelOpen = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setOpen(false)
  }

  const posClass = side === 'top'
    ? 'bottom-full mb-2 left-1/2 -translate-x-1/2 origin-bottom'
    : 'top-full mt-2 left-1/2 -translate-x-1/2 origin-top'

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={scheduleOpen}
        onMouseLeave={cancelOpen}
        onFocus={scheduleOpen}
        onBlur={cancelOpen}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--c-border-strong)] text-[var(--c-text-muted)] hover:text-[#22B585] hover:border-[#22B585]/50 transition-colors cursor-help align-middle ml-1.5"
      >
        {/* Universal "info" glyph — dot + stem, more readable than "?" at this size */}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
          <circle cx="4" cy="1.6" r="0.85" fill="currentColor" />
          <rect x="3.3" y="3.4" width="1.4" height="3.4" rx="0.55" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 ${posClass} w-64 max-w-[80vw] pointer-events-none animate-fade`}
        >
          <span className="glass block rounded-lg px-3 py-2.5 text-[12px] leading-relaxed text-[var(--c-text)]">
            {children}
          </span>
        </span>
      )}
    </span>
  )
}
