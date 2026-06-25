import { createPortal } from 'react-dom'
import { usePrefs } from '../hooks/usePrefs'
import { prefs, DEFAULTS } from '../utils/prefs'
import { toast } from '../utils/toast'

const REFRESH_OPTIONS = [
  { label: 'Off',   value: 0          },
  { label: '1 min', value:  60_000    },
  { label: '5 min', value: 300_000    },
  { label: '10 min', value: 600_000   },
  { label: '30 min', value: 1_800_000 },
]

const STALE_OPTIONS = [
  { label: '5 min',  value: 300_000    },
  { label: '10 min', value: 600_000    },
  { label: '30 min', value: 1_800_000  },
  { label: '1 hour', value: 3_600_000  },
]

function Choice({ label, options, value, onChange, hint }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[11px] font-semibold text-[#d1d9d5] uppercase tracking-[0.12em]">{label}</label>
        {hint && <span className="text-[10.5px] text-[#6b8478]">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = value === opt.value
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-semibold tracking-[0.05em] cursor-pointer transition-colors ${
                active
                  ? 'bg-[#1D9E75]/15 border-[#1D9E75]/50 text-[#1D9E75]'
                  : 'bg-[#0a100c] border-[#1a2e1f] text-[#8a9b91] hover:border-[#263d2c] hover:text-[#d1d9d5]'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function SettingsModal({ open, onClose }) {
  const cur = usePrefs()
  if (!open) return null

  const handleReset = () => {
    prefs.reset()
    toast.show('Preferences reset to defaults')
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-fade"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[#040605]/70 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="glass-strong relative w-full max-w-md rounded-2xl overflow-hidden animate-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2e1f]">
          <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.14em]">Preferences</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#4b6358] hover:text-[#d1d9d5] transition-colors p-1 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-5">
          <Choice
            label="Auto-refresh"
            options={REFRESH_OPTIONS}
            value={cur.refreshMs}
            onChange={v => prefs.set('refreshMs', v)}
            hint="Idle ticker re-fetch"
          />
          <Choice
            label="Stale warning"
            options={STALE_OPTIONS}
            value={cur.staleMs}
            onChange={v => prefs.set('staleMs', v)}
            hint="When the dot turns amber"
          />

          <p className="text-[11px] text-[#6b8478] leading-relaxed">
            Auto-refresh skips when the tab is hidden or the market is closed. Preferences are saved locally on this device.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[#1a2e1f] bg-[#080c0a]/60">
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#4b6358] hover:text-[#d4922a] cursor-pointer transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#3a4f44]">
            <span>{cur.refreshMs === DEFAULTS.refreshMs && cur.staleMs === DEFAULTS.staleMs ? 'Default' : 'Custom'}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
