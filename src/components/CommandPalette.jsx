import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Curated baseline of popular tickers shown when the palette opens empty.
// Match the symbols already used in the hero ticker tape so the experience is consistent.
const POPULAR = [
  { sym: 'AAPL',  name: 'Apple Inc',          ex: 'NDQ'  },
  { sym: 'MSFT',  name: 'Microsoft Corp',     ex: 'NDQ'  },
  { sym: 'NVDA',  name: 'NVIDIA Corp',        ex: 'NDQ'  },
  { sym: 'GOOGL', name: 'Alphabet Inc',       ex: 'NDQ'  },
  { sym: 'META',  name: 'Meta Platforms',     ex: 'NDQ'  },
  { sym: 'AMZN',  name: 'Amazon.com',         ex: 'NDQ'  },
  { sym: 'TSLA',  name: 'Tesla Inc',          ex: 'NDQ'  },
  { sym: 'AMD',   name: 'AMD',                ex: 'NDQ'  },
  { sym: 'AVGO',  name: 'Broadcom',           ex: 'NDQ'  },
  { sym: 'TSM',   name: 'Taiwan Semi',        ex: 'NYSE' },
  { sym: 'NFLX',  name: 'Netflix Inc',        ex: 'NDQ'  },
  { sym: 'PLTR',  name: 'Palantir',           ex: 'NYSE' },
  { sym: 'COIN',  name: 'Coinbase',           ex: 'NDQ'  },
  { sym: 'RKLB',  name: 'Rocket Lab',         ex: 'NDQ'  },
  { sym: 'LUNR',  name: 'Intuitive Machines', ex: 'NDQ'  },
  { sym: 'ASTS',  name: 'AST SpaceMobile',    ex: 'NDQ'  },
  { sym: 'SPCE',  name: 'Virgin Galactic',    ex: 'NYSE' },
  { sym: 'LMT',   name: 'Lockheed Martin',    ex: 'NYSE' },
  { sym: 'BA',    name: 'Boeing',             ex: 'NYSE' },
  { sym: 'JPM',   name: 'JPMorgan Chase',     ex: 'NYSE' },
  { sym: 'V',     name: 'Visa Inc',           ex: 'NYSE' },
  { sym: 'SPY',   name: 'SPDR S&P 500',       ex: 'NYSE' },
  { sym: 'QQQ',   name: 'Nasdaq 100 ETF',     ex: 'NDQ'  },
  { sym: 'IWM',   name: 'Russell 2000 ETF',   ex: 'NYSE' },
]

const SECTIONS = [
  { key: 'screener',  label: 'Open Screener',  sub: 'Filter and rank stocks',          jump: 'screener'  },
  { key: 'portfolio', label: 'Open Portfolio', sub: 'Holdings, returns, AI summary',   jump: 'portfolio' },
  { key: 'sectors',   label: 'Open Sectors',   sub: 'Sector heatmap',                  jump: 'sectors'   },
  { key: 'compare',   label: 'Open Compare',   sub: 'Side-by-side ticker comparison',  jump: 'compare'   },
  { key: 'alerts',    label: 'Price Alerts',   sub: 'Scroll to alert configuration',   jump: 'alerts'    },
  { key: 'news',      label: 'News Feed',      sub: 'Scroll to news for current ticker', jump: 'news'    },
]

function getRecent() {
  try { return JSON.parse(localStorage.getItem('kairo_recent') ?? '[]') }
  catch { return [] }
}

function fuzzy(query, ...fields) {
  if (!query) return true
  const q = query.toLowerCase()
  return fields.some(f => f && String(f).toLowerCase().includes(q))
}

function ResultRow({ item, active, onSelect }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}  // keep input focus through click
      onClick={onSelect}
      data-active={active || undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-left transition-colors ${
        active
          ? 'bg-[#1D9E75]/10 border border-[#1D9E75]/25'
          : 'border border-transparent hover:bg-[#0c1410]'
      }`}
    >
      {/* Leading icon: ticker mono / section glyph */}
      <span className={`shrink-0 w-9 h-9 rounded-md border flex items-center justify-center font-mono text-[10px] font-bold tabular-nums ${
        item.kind === 'section'
          ? 'border-[#1a2e1f] bg-[#0a100c] text-[#4b6358]'
          : 'border-[#1D9E75]/25 bg-[#1D9E75]/5 text-[#1D9E75]'
      }`}>
        {item.kind === 'ticker' ? item.sym : '⌘'}
      </span>

      {/* Label + sub */}
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-sm font-semibold text-[#d1d9d5] truncate">
          {item.kind === 'ticker' ? `${item.sym}` : item.label}
          {item.kind === 'ticker' && item.name && (
            <span className="ml-2 text-[#4b6358] font-normal">{item.name}</span>
          )}
        </span>
        {item.sub && <span className="text-[11px] text-[#4b6358] truncate">{item.sub}</span>}
      </span>

      {/* Trailing badge: exchange or hint */}
      {item.kind === 'ticker' && (
        <span className="shrink-0 font-mono text-[9px] font-semibold tracking-[0.15em] text-[#3a4f44]">{item.ex}</span>
      )}
      {item.kind === 'recent' && (
        <span className="shrink-0 text-[9px] uppercase tracking-[0.15em] text-[#3a4f44]">Recent</span>
      )}
      {active && (
        <span className="shrink-0 font-mono text-[10px] text-[#1D9E75]">↵</span>
      )}
    </button>
  )
}

function GroupHeader({ children }) {
  return (
    <div className="px-3 pt-3 pb-1.5 text-[9.5px] uppercase tracking-[0.18em] font-semibold text-[#3a4f44]">
      {children}
    </div>
  )
}

export default function CommandPalette({ open, onClose, onSelectTicker, onJumpTo }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)
  const recent   = useMemo(getRecent, [open])

  // Build full result list, then filter
  const all = useMemo(() => {
    const tickerKey = new Set(POPULAR.map(p => p.sym))
    const recentTickers = recent
      .filter(sym => sym && typeof sym === 'string')
      .filter(sym => !tickerKey.has(sym))   // dedupe vs POPULAR
      .map(sym => ({ kind: 'recent', sym, name: '', ex: '' }))

    return {
      recent:   recentTickers,
      tickers:  POPULAR.map(p => ({ kind: 'ticker', ...p })),
      sections: SECTIONS.map(s => ({ kind: 'section', ...s })),
    }
  }, [recent])

  const filtered = useMemo(() => {
    const q = query.trim()
    const f = {
      recent:   all.recent  .filter(i => fuzzy(q, i.sym)),
      tickers:  all.tickers .filter(i => fuzzy(q, i.sym, i.name)),
      sections: all.sections.filter(i => fuzzy(q, i.label, i.sub, i.key)),
    }
    return f
  }, [all, query])

  // Flat list in render order — what arrow keys + Enter operate on.
  const flat = useMemo(
    () => [...filtered.recent, ...filtered.tickers, ...filtered.sections],
    [filtered],
  )

  // Reset state when closed; focus input when opened.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
      return
    }
    // Defer focus to next tick so the modal is mounted
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Reset active when filter changes
  useEffect(() => { setActive(0) }, [query])

  // Keyboard navigation within the palette
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(a => Math.min(flat.length - 1, a + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(a => Math.max(0, a - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = flat[active]
        if (item) handleSelect(item)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flat, active])

  // Scroll active row into view
  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  function handleSelect(item) {
    if (item.kind === 'ticker' || item.kind === 'recent') {
      onSelectTicker?.(item.sym)
    } else if (item.kind === 'section') {
      onJumpTo?.(item.jump)
    }
    onClose?.()
  }

  // Compute global index per item for keyboard highlighting
  let idx = -1
  const renderRow = (item) => {
    idx += 1
    return (
      <ResultRow
        key={`${item.kind}-${item.sym ?? item.key}`}
        item={item}
        active={idx === active}
        onSelect={() => handleSelect(item)}
      />
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 animate-fade"
      onMouseDown={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#040605]/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-[520px] rounded-2xl border border-[#1a2e1f] bg-[#0a100c]/95 backdrop-blur-md shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)] overflow-hidden animate-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1a2e1f]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#4b6358] shrink-0">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or jump to section…"
            className="flex-1 bg-transparent text-sm text-[#d1d9d5] placeholder:text-[#4b6358] outline-none"
          />
          <span className="font-mono text-[9px] font-semibold tracking-[0.18em] uppercase text-[#3a4f44] border border-[#1a2e1f] rounded px-1.5 py-0.5">
            Esc
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto px-2 py-2">
          {filtered.recent.length > 0 && (
            <>
              <GroupHeader>Recent</GroupHeader>
              {filtered.recent.map(renderRow)}
            </>
          )}
          {filtered.tickers.length > 0 && (
            <>
              <GroupHeader>Tickers</GroupHeader>
              {filtered.tickers.map(renderRow)}
            </>
          )}
          {filtered.sections.length > 0 && (
            <>
              <GroupHeader>Sections</GroupHeader>
              {filtered.sections.map(renderRow)}
            </>
          )}
          {flat.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-[#4b6358]">
              No matches. Try a different ticker or section name.
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[#1a2e1f] bg-[#080c0a]/60 text-[10px] font-mono tracking-wider text-[#4b6358]">
          <span className="flex items-center gap-2">
            <span><kbd className="text-[#d1d9d5]">↑↓</kbd> navigate</span>
            <span className="text-[#1a2e1f]">·</span>
            <span><kbd className="text-[#d1d9d5]">↵</kbd> select</span>
          </span>
          <span><kbd className="text-[#d1d9d5]">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
