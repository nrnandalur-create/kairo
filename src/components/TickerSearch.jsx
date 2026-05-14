import { useState } from 'react'

export default function TickerSearch({ onSearch }) {
  const [value, setValue] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const ticker = value.trim().toUpperCase()
    if (ticker) onSearch(ticker)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 w-full max-w-xl">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter ticker symbol — e.g. AAPL"
        className="flex-1 bg-[#1a1d27] border border-[#2e3347] rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-[#1D9E75] transition-colors"
      />
      <button
        type="submit"
        className="bg-[#1D9E75] hover:bg-[#158a63] text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors cursor-pointer"
      >
        Analyze
      </button>
    </form>
  )
}
