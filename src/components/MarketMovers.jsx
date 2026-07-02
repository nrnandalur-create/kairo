import { useEffect, useState } from 'react'

// Market Front Door — Top Gainers + Top Losers side by side.
// Every row is one tap to analyze; the click flows through the parent
// (App.jsx handleSearch), which ALREADY registers the search against
// the free-tier daily quota. Browsing movers is deliberately NOT a
// side-door around the search cap.

function fmtPrice(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1000) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function Row({ item, tone, onSelect }) {
  const color = tone === 'gain' ? '#22B585' : '#ef5454'
  return (
    <button
      type="button"
      onClick={() => onSelect(item.symbol)}
      className="w-full grid grid-cols-[minmax(60px,auto)_1fr_auto_auto] items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-[var(--c-hover-bg)] transition-colors duration-150 cursor-pointer text-left"
      title={`Analyze ${item.symbol}`}
    >
      <span className="font-mono text-[12.5px] font-black text-[var(--c-text)] tracking-[0.04em]">
        {item.symbol}
      </span>
      <span className="text-[11px] text-[var(--c-text-faint)] truncate">
        {item.name}
      </span>
      <span className="text-[12px] tabular-nums text-[var(--c-text)]">
        {fmtPrice(item.price)}
      </span>
      <span
        className="text-[12px] font-bold tabular-nums whitespace-nowrap px-2 py-0.5 rounded-md border"
        style={{
          color,
          borderColor: `${color}45`,
          backgroundColor: `${color}18`,
        }}
      >
        {fmtPct(item.changePct)}
      </span>
    </button>
  )
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-[minmax(60px,auto)_1fr_auto_auto] items-center gap-3 py-2.5 px-2">
      <div className="h-3 w-10 rounded-full shimmer" />
      <div className="h-3 w-full rounded-full shimmer" />
      <div className="h-3 w-12 rounded-full shimmer" />
      <div className="h-5 w-14 rounded-md shimmer" />
    </div>
  )
}

function MoversCard({ tone, title, items, loading, onSelect, atLabel }) {
  const color = tone === 'gain' ? '#22B585' : '#ef5454'
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em] inline-flex items-center gap-1.5"
          style={{ color }}
        >
          <span aria-hidden="true">{tone === 'gain' ? '▲' : '▼'}</span> {title}
        </span>
        {atLabel && (
          <span className="text-[10px] text-[var(--c-text-fainter)] tabular-nums">
            {atLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        {loading
          ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} />)
          : items.length
            ? items.map(item => (
                <Row key={item.symbol} item={item} tone={tone} onSelect={onSelect} />
              ))
            : (
              <p className="text-[12px] text-[var(--c-text-fainter)] py-4 text-center">
                Nothing notable right now.
              </p>
            )}
      </div>
    </div>
  )
}

export default function MarketMovers({ onSelect }) {
  const [state, setState] = useState({ gainers: [], losers: [], loading: true, error: null, at: null })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/market-pulse?action=movers')
        if (!r.ok) throw new Error(`Movers request failed (${r.status})`)
        const data = await r.json()
        if (cancelled) return
        setState({
          gainers: data.gainers ?? [],
          losers:  data.losers  ?? [],
          loading: false,
          error:   null,
          at:      data.at ?? Date.now(),
        })
      } catch (err) {
        if (cancelled) return
        setState(s => ({ ...s, loading: false, error: err?.message ?? 'Movers unavailable' }))
      }
    })()
    return () => { cancelled = true }
  }, [])

  const atLabel = state.at
    ? `As of ${new Date(state.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : null

  // Total failure — render one honest error card instead of two empty tiles.
  if (state.error && !state.loading) {
    return (
      <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-2 animate-fade">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em]">
            Market Movers
          </span>
          <span className="text-[9px] font-bold tracking-widest uppercase text-[var(--c-text-faint)] border border-[var(--c-border)] rounded-full px-2 py-0.5">
            Unavailable
          </span>
        </div>
        <p className="text-[12.5px] text-[var(--c-text)]/85 leading-relaxed">
          Couldn't load the movers scan right now. Try refreshing in a moment.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      <MoversCard
        tone="gain"
        title="Top Gainers"
        items={state.gainers}
        loading={state.loading}
        onSelect={onSelect}
        atLabel={atLabel}
      />
      <MoversCard
        tone="loss"
        title="Top Losers"
        items={state.losers}
        loading={state.loading}
        onSelect={onSelect}
        atLabel={atLabel}
      />
    </div>
  )
}
