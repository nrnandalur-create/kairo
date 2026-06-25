import { useEffect, useState } from 'react'
import { toast } from '../utils/toast'

const VARIANTS = {
  info:    { dot: '#1D9E75', border: 'border-[var(--c-border)]',    glow: '0 0 24px -8px rgba(29,158,117,0.30)' },
  success: { dot: '#1D9E75', border: 'border-[#1D9E75]/35', glow: '0 0 24px -6px rgba(29,158,117,0.45)' },
  error:   { dot: '#e24b4a', border: 'border-[#e24b4a]/35', glow: '0 0 24px -6px rgba(226,75,74,0.40)'  },
  warning: { dot: '#d4922a', border: 'border-[#d4922a]/35', glow: '0 0 24px -6px rgba(212,146,42,0.40)' },
}

function ToastCard({ id, variant, message, action }) {
  const v = VARIANTS[variant] ?? VARIANTS.info
  return (
    <div
      role="status"
      className={`glass flex items-center gap-3 ${v.border} text-[var(--c-text)] text-xs font-medium px-4 py-2.5 rounded-xl whitespace-nowrap animate-enter pointer-events-auto`}
      style={{ boxShadow: `0 12px 24px -8px rgba(0,0,0,0.55), ${v.glow}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: v.dot }} />
      <span className="flex-1">{message}</span>
      {action && (
        <button
          type="button"
          onClick={() => { action.onClick?.(); toast.dismiss(id) }}
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1D9E75] hover:text-[#27c490] cursor-pointer"
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => toast.dismiss(id)}
        className="text-[var(--c-text-faint)] hover:text-[var(--c-text)] cursor-pointer transition-colors text-base leading-none"
      >
        ×
      </button>
    </div>
  )
}

export default function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => toast._subscribe(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] lg:bottom-12 lg:left-auto lg:right-6 lg:translate-x-0 flex flex-col gap-2 pointer-events-none">
      {items.map(t => <ToastCard key={t.id} {...t} />)}
    </div>
  )
}
