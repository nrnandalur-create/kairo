import { useState } from 'react'

export default function TickerSearch({ onSearch, loading }) {
  const [value, setValue] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const ticker = value.trim().toUpperCase()
    if (ticker && !loading) onSearch(ticker)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-sm">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ticker — e.g. AAPL"
        disabled={loading}
        autoComplete="off"
        spellCheck={false}
        className="flex-1 bg-[#0d1510] border border-[#1e2d28] rounded-xl px-4 py-2.5 text-sm text-[#d1d9d5] placeholder-[#2e4a3a] outline-none transition-all duration-200 focus:border-[#1D9E75] focus:bg-[#0f1a12] focus:shadow-[0_0_0_3px_rgba(29,158,117,0.12)] disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="bg-[#1D9E75] hover:bg-[#20b382] active:scale-[0.96] active:bg-[#178f68] disabled:opacity-35 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer select-none"
      >
        {loading ? '…' : 'Analyze'}
      </button>
    </form>
  )
}
