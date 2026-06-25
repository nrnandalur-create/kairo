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
        <label className="text-[11px] font-semibold text-[var(--c-text)] uppercase tracking-[0.12em]">{label}</label>
        {hint && <span className="text-[10.5px] text-[var(--c-text-muted)]">{hint}</span>}
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
                  : 'bg-[var(--c-bg-deep)] border-[var(--c-border)] text-[var(--c-text-muted)] hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]'
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
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--c-border)]">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em]">Preferences</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors p-1 cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Theme toggle */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label className="text-[11px] font-semibold text-[var(--c-text)] uppercase tracking-[0.12em]">Appearance</label>
              <span className="text-[10.5px] text-[var(--c-text-muted)]">Light or dark</span>
            </div>
            <div className="flex gap-1.5 p-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-bg-deep)]">
              {[
                { value: 'dark',  label: 'Dark',  icon: '☾' },
                { value: 'light', label: 'Light', icon: '☀' },
              ].map(opt => {
                const active = cur.theme === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => prefs.set('theme', opt.value)}
                    className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-mono font-semibold tracking-[0.05em] cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5 ${
                      active
                        ? 'bg-[#1D9E75]/15 text-[#1D9E75] border border-[#1D9E75]/50'
                        : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)] border border-transparent'
                    }`}
                  >
                    <span aria-hidden>{opt.icon}</span>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Translucency slider */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label className="text-[11px] font-semibold text-[var(--c-text)] uppercase tracking-[0.12em]">Glass translucency</label>
              <span className="text-[10.5px] text-[var(--c-text-muted)]">
                {cur.glassMult <= 0.45 ? 'Clear'
                  : cur.glassMult <= 0.85 ? 'Light'
                  : cur.glassMult <= 1.15 ? 'Default'
                  : cur.glassMult <= 1.35 ? 'Frosted'
                  : 'Solid'}
              </span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.5"
              step="0.05"
              value={cur.glassMult}
              onChange={e => prefs.set('glassMult', +e.target.value)}
              className="w-full accent-[#1D9E75] cursor-pointer h-1 rounded-full"
              style={{
                background: `linear-gradient(to right, #1D9E75 0%, #1D9E75 ${((cur.glassMult - 0.2) / 1.3) * 100}%, #1a2e1f ${((cur.glassMult - 0.2) / 1.3) * 100}%, #1a2e1f 100%)`,
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            />
            <div className="flex justify-between text-[9.5px] uppercase tracking-[0.14em] text-[var(--c-text-fainter)] font-mono">
              <span>Clear</span>
              <span>Frosted</span>
            </div>
          </div>

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

          <p className="text-[11px] text-[var(--c-text-muted)] leading-relaxed">
            Auto-refresh skips when the tab is hidden or the market is closed. Preferences are saved locally on this device.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--c-border)] bg-[var(--c-bg)]/60">
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--c-text-faint)] hover:text-[#d4922a] cursor-pointer transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--c-text-fainter)]">
            <span>{
              cur.refreshMs === DEFAULTS.refreshMs
                && cur.staleMs   === DEFAULTS.staleMs
                && cur.theme     === DEFAULTS.theme
                && cur.glassMult === DEFAULTS.glassMult
                ? 'Default' : 'Custom'
            }</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
