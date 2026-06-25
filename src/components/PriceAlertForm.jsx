import { useState, useEffect } from 'react'
import { toast } from '../utils/toast'

export default function PriceAlertForm({ ticker, currentPrice, getAlert, setAlert, clearAlert }) {
  const existing    = getAlert(ticker)
  const [target, setTarget] = useState(existing?.target ?? '')
  const [stop,   setStop]   = useState(existing?.stop   ?? '')
  const [errors, setErrors] = useState({ target: null, stop: null })

  useEffect(() => {
    const a = getAlert(ticker)
    setTarget(a?.target ?? '')
    setStop(a?.stop ?? '')
    setErrors({ target: null, stop: null })
  }, [ticker])

  // Validate user input on the fly. Empty values are allowed (alert is optional).
  function validate(t, s) {
    const next = { target: null, stop: null }
    if (t && (isNaN(Number(t)) || Number(t) <= 0)) next.target = 'Must be a positive number'
    if (s && (isNaN(Number(s)) || Number(s) <= 0)) next.stop   = 'Must be a positive number'
    if (currentPrice && t && Number(t) <= currentPrice) next.target = `Target should be above $${currentPrice.toFixed(2)}`
    if (currentPrice && s && Number(s) >= currentPrice) next.stop   = `Stop should be below $${currentPrice.toFixed(2)}`
    return next
  }

  const liveErrors = validate(target, stop)
  const hasErrors  = liveErrors.target || liveErrors.stop
  const canSubmit  = (target || stop) && !hasErrors

  const handleSet = () => {
    const v = validate(target, stop)
    setErrors(v)
    if (v.target || v.stop) return
    if (!target && !stop) return
    setAlert(ticker, target, stop)
    toast.success(`Alert set for ${ticker}`)
  }

  const handleClear = () => {
    clearAlert(ticker)
    setTarget('')
    setStop('')
    setErrors({ target: null, stop: null })
    toast.show(`Alert cleared for ${ticker}`)
  }

  const isSet = !!existing?.target || !!existing?.stop
  const p     = currentPrice

  return (
    <div className="w-full glass-card rounded-2xl p-5 flex flex-col gap-4 animate-enter">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Price Alerts</span>
        {isSet && (
          <button
            onClick={handleClear}
            className="text-[10px] text-[#e24b4a]/60 hover:text-[#e24b4a] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {isSet && (
        <div className="flex gap-4 flex-wrap">
          {existing.target && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[#1D9E75] uppercase tracking-widest">▲ Target</span>
              <span className="text-sm font-black tabular-nums text-[#1D9E75]">${Number(existing.target).toFixed(2)}</span>
            </div>
          )}
          {existing.stop && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[#e24b4a] uppercase tracking-widest">▼ Stop</span>
              <span className="text-sm font-black tabular-nums text-[#e24b4a]">${Number(existing.stop).toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Target</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={p ? `e.g. ${(p * 1.1).toFixed(2)}` : 'Price'}
            aria-invalid={!!errors.target}
            className={`w-32 bg-[var(--c-bg-deep)] border rounded-lg px-3 py-2 text-sm text-[var(--c-text)] placeholder-[#263d2c] outline-none transition-colors tabular-nums ${
              errors.target
                ? 'border-[#e24b4a] focus:border-[#e24b4a]'
                : 'border-[var(--c-border)] focus:border-[#1D9E75]'
            }`}
          />
          {errors.target && <span className="text-[11px] text-[#e24b4a] max-w-[180px] leading-tight">{errors.target}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Stop Loss</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={stop}
            onChange={e => setStop(e.target.value)}
            placeholder={p ? `e.g. ${(p * 0.9).toFixed(2)}` : 'Price'}
            aria-invalid={!!errors.stop}
            className={`w-32 bg-[var(--c-bg-deep)] border rounded-lg px-3 py-2 text-sm text-[var(--c-text)] placeholder-[#263d2c] outline-none transition-colors tabular-nums ${
              errors.stop
                ? 'border-[#e24b4a] focus:border-[#e24b4a]'
                : 'border-[var(--c-border)] focus:border-[#e24b4a]'
            }`}
          />
          {errors.stop && <span className="text-[11px] text-[#e24b4a] max-w-[180px] leading-tight">{errors.stop}</span>}
        </div>
        <button
          onClick={handleSet}
          disabled={!canSubmit}
          title={!canSubmit ? (hasErrors ? 'Fix the errors above first' : 'Enter a target or stop price') : undefined}
          className="mt-[18px] bg-[#1D9E75] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#20b382] active:scale-[0.96] text-white font-semibold text-sm px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
        >
          Set Alert
        </button>
      </div>

      <p className="text-[11px] text-[var(--c-text-faint)] leading-relaxed">
        Alerts are stored locally. Your watchlist will show a badge when price crosses a level.
      </p>
    </div>
  )
}
