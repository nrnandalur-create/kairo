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
        className="flex-1 bg-[#111a17] border border-[#1e2d28] rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-[#1D9E75] transition-colors disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="bg-[#1D9E75] hover:bg-[#158a63] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
      >
        {loading ? '…' : 'Analyze'}
      </button>
    </form>
  )
}
