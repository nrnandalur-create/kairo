import { useState, useId } from 'react'

// Small "?" affordance that reveals a methodology / source explainer on hover
// or keyboard focus. Use on data-panel titles where the source isn't obvious.
//
// Usage:
//   <h3 className="...">AI Analysis <InfoTooltip>Built on Groq LLaMA over technical indicators + recent price action.</InfoTooltip></h3>
export default function InfoTooltip({ children, label = 'About this data', side = 'bottom' }) {
  const [open, setOpen] = useState(false)
  const id = useId()

  const posClass = side === 'top'
    ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
    : 'top-full mt-2 left-1/2 -translate-x-1/2'

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#263d2c] text-[#8a9b91] hover:text-[#1D9E75] hover:border-[#1D9E75]/50 transition-colors cursor-help align-middle ml-1.5"
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
          className={`absolute z-50 ${posClass} w-64 max-w-[80vw] pointer-events-none`}
        >
          <span className="glass block rounded-lg px-3 py-2.5 text-[12px] leading-relaxed text-[#d1d9d5]">
            {children}
          </span>
        </span>
      )}
    </span>
  )
}
