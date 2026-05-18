import { useState, useEffect } from 'react'

export default function PriceAlertForm({ ticker, currentPrice, getAlert, setAlert, clearAlert }) {
  const existing    = getAlert(ticker)
  const [target, setTarget] = useState(existing?.target ?? '')
  const [stop,   setStop]   = useState(existing?.stop   ?? '')

  useEffect(() => {
    const a = getAlert(ticker)
    setTarget(a?.target ?? '')
    setStop(a?.stop ?? '')
  }, [ticker])

  const handleSet = () => {
    if (!target && !stop) return
    setAlert(ticker, target, stop)
  }

  const handleClear = () => {
    clearAlert(ticker)
    setTarget('')
    setStop('')
  }

  const isSet = !!existing?.target || !!existing?.stop
  const p     = currentPrice

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-5 flex flex-col gap-4 animate-enter">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Price Alerts</span>
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

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-bold text-[#4b6358] uppercase tracking-widest">Target</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={p ? `e.g. ${(p * 1.1).toFixed(2)}` : 'Price'}
            className="w-32 bg-[#0a0f0d] border border-[#1a2e1f] rounded-lg px-3 py-2 text-sm text-[#d1d9d5] placeholder-[#263d2c] outline-none focus:border-[#1D9E75] transition-colors tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-bold text-[#4b6358] uppercase tracking-widest">Stop Loss</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={stop}
            onChange={e => setStop(e.target.value)}
            placeholder={p ? `e.g. ${(p * 0.9).toFixed(2)}` : 'Price'}
            className="w-32 bg-[#0a0f0d] border border-[#1a2e1f] rounded-lg px-3 py-2 text-sm text-[#d1d9d5] placeholder-[#263d2c] outline-none focus:border-[#e24b4a] transition-colors tabular-nums"
          />
        </div>
        <button
          onClick={handleSet}
          disabled={!target && !stop}
          className="bg-[#1D9E75] disabled:opacity-30 hover:bg-[#20b382] active:scale-[0.96] text-white font-semibold text-sm px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
        >
          Set Alert
        </button>
      </div>

      <p className="text-[10px] text-[#263d2c] leading-relaxed">
        Alerts are stored locally. Your watchlist will show a badge when price crosses a level.
      </p>
    </div>
  )
}
