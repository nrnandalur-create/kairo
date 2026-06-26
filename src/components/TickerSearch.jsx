import { useState, useEffect, useRef } from 'react'

const DEBOUNCE_MS = 280

async function searchSymbols(q) {
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
    if (!r.ok) return []
    const d = await r.json()
    return d.results ?? []
  } catch {
    return []
  }
}

export default function TickerSearch({ onSearch, loading }) {
  const [value, setValue]         = useState('')
  const [results, setResults]     = useState([])
  const [open, setOpen]           = useState(false)
  const [fetching, setFetching]   = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const debounceRef  = useRef(null)
  const containerRef = useRef(null)

  // Debounced autocomplete
  useEffect(() => {
    clearTimeout(debounceRef.current)
    const q = value.trim()
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      setFetching(false)
      return
    }
    setFetching(true)
    debounceRef.current = setTimeout(async () => {
      const res = await searchSymbols(q)
      setResults(res)
      setOpen(res.length > 0)
      setHighlighted(-1)
      setFetching(false)
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const commit = (sym) => {
    const ticker = sym.trim().toUpperCase()
    if (!ticker || loading) return
    setOpen(false)
    setValue(ticker)
    onSearch(ticker)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const sym = highlighted >= 0 && results[highlighted]
      ? results[highlighted].symbol
      : value
    commit(sym)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!open || !results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, -1))
    }
  }

  return (
    <form
      ref={containerRef}
      onSubmit={handleSubmit}
      className="relative flex gap-2 w-full max-w-sm"
    >
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Ticker or company name"
          disabled={loading}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          inputMode="search"
          className="w-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl px-4 py-2.5 text-base sm:text-sm text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none transition-all duration-200 focus:border-[#22B585] focus:bg-[var(--c-input-bg)] focus:shadow-[0_0_0_3px_rgba(29,158,117,0.12)] disabled:opacity-40 disabled:cursor-not-allowed"
        />

        {/* Dropdown */}
        {(open || (fetching && value.trim().length >= 2)) && (
          <div className="absolute top-full left-0 right-0 mt-1.5 glass-card rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-50">
            {fetching && !results.length ? (
              <div className="flex flex-col gap-2 p-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between gap-4 px-1 py-1">
                    <div className="h-3 w-12 rounded-full shimmer" />
                    <div className="h-3 w-32 rounded-full shimmer" />
                  </div>
                ))}
              </div>
            ) : (
              results.map((r, i) => (
                <button
                  key={r.symbol}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); commit(r.symbol) }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 ${
                    i > 0 ? 'border-t border-[var(--c-border)]' : ''
                  } ${i === highlighted ? 'bg-[#22B585]/10' : 'hover:bg-[var(--c-hover-bg)]'}`}
                >
                  <span className="text-sm font-bold text-[var(--c-text)] shrink-0 w-16">{r.symbol}</span>
                  <span className="text-xs text-[var(--c-text-faint)] truncate">{r.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.96] active:bg-[#178f68] disabled:opacity-35 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all duration-150 cursor-pointer select-none whitespace-nowrap"
      >
        {loading ? '…' : 'Analyze'}
      </button>
    </form>
  )
}
