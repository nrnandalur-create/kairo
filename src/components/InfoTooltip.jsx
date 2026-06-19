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
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[#1a2e1f] text-[#4b6358] hover:text-[#1D9E75] hover:border-[#1D9E75]/40 transition-colors cursor-help text-[9px] font-bold leading-none align-middle ml-1.5"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 ${posClass} w-64 max-w-[80vw] pointer-events-none`}
        >
          <span className="block rounded-lg border border-[#1a2e1f] bg-[#0a100c]/95 backdrop-blur-md px-3 py-2 text-[11px] leading-relaxed text-[#d1d9d5] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.6)]">
            {children}
          </span>
        </span>
      )}
    </span>
  )
}
