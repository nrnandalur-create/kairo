import { useState, useEffect } from 'react'
import { fetchMarketPulse } from '../services/marketPulse'
import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'
import ErrorCard from './ErrorCard'

function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`
}

const INDEX_NAMES = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', DIA: 'Dow Jones' }

function IndexTile({ symbol, price, changePct }) {
  const valid = changePct != null && !isNaN(changePct)
  const up    = valid && changePct >= 0
  const color = !valid ? 'var(--c-text-faint)' : up ? '#22B585' : '#ef5454'
  const bgBar = !valid ? 'var(--c-chip-bg)' : up ? 'rgba(34,181,133,0.10)' : 'rgba(239,84,84,0.10)'

  return (
    <div className="flex-1 flex flex-col gap-1.5 px-6 py-5 transition-colors duration-150 hover:bg-[var(--c-hover-bg)]" style={{ background: bgBar }}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-[var(--c-text)] uppercase tracking-[0.1em]">{symbol}</span>
        <span className="text-[9px] text-[var(--c-text-faint)] hidden sm:inline">{INDEX_NAMES[symbol]}</span>
      </div>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="text-xl font-black tabular-nums text-[var(--c-text)] leading-none">${fmtPrice(price)}</span>
        <span className="text-xs font-bold tabular-nums leading-none" style={{ color }}>{fmtPct(changePct)}</span>
      </div>
    </div>
  )
}

function MoverRow({ symbol, price, changePct, rank }) {
  const up       = changePct != null && changePct >= 0
  const badge    = up
    ? 'bg-[#22B585]/10 border-[#22B585]/25 text-[#22B585]'
    : 'bg-[#ef5454]/10 border-[#ef5454]/25 text-[#ef5454]'

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0 -mx-1 px-1 rounded-md hover:bg-[var(--c-hover-bg)] transition-colors duration-150">
      <span className="text-[10px] text-[var(--c-text-fainter)] tabular-nums w-4 shrink-0 text-right">{rank}</span>
      <span className="text-sm font-bold text-[var(--c-text)] w-14 shrink-0">{symbol}</span>
      <span className="text-sm tabular-nums text-[var(--c-text-faint)] flex-1">${fmtPrice(price)}</span>
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest shrink-0 ${badge}`}>
        {fmtPct(changePct)}
      </span>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="w-full flex flex-col gap-4">
      {/* Indices bar skeleton */}
      <div className="w-full glass-card rounded-2xl overflow-hidden flex divide-x divide-[#1a2e1f]">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex-1 px-6 py-5 flex flex-col gap-2.5">
            <div className="h-2.5 w-10 rounded-full shimmer" />
            <div className="h-6 w-28 rounded-full shimmer" />
          </div>
        ))}
      </div>
      {/* Movers + sentiment skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 flex flex-col gap-4">
          <div className="h-2.5 w-24 rounded-full shimmer" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {[0, 1].map(col => (
              <div key={col} className="flex flex-col gap-1">
                <div className="h-2 w-14 rounded-full shimmer mb-2" />
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[var(--c-border)] last:border-0">
                    <div className="h-3 w-4 rounded-full shimmer shrink-0" />
                    <div className="h-3 w-14 rounded-full shimmer shrink-0" />
                    <div className="h-3 flex-1 rounded-full shimmer" />
                    <div className="h-5 w-14 rounded-full shimmer shrink-0" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-4">
          <div className="h-2.5 w-32 rounded-full shimmer" />
          <div className="h-10 w-32 rounded-full shimmer" />
          <div className="h-3 w-full rounded-full shimmer" />
          <div className="h-1 w-full rounded-full shimmer" />
        </div>
      </div>
    </div>
  )
}

export default function MarketPulse() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [fetchedAt, setFetched] = useState(null)
  const [error, setError]       = useState(null)

  const load = () => {
    setError(null)
    return fetchMarketPulse()
      .then(d => { setData(d); setFetched(Date.now()) })
      .catch(() => setError('Unable to reach Finnhub. Market data may be unavailable.'))
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <Skeleton />
  if (error && !data) return <ErrorCard message={error} onRetry={load} />
  if (!data) return null

  const movers  = (data.movers ?? []).filter(m => m.price != null)
  const gainers = [...movers].sort((a, b) => b.changePct - a.changePct).slice(0, 3)
  const losers  = [...movers].sort((a, b) => a.changePct - b.changePct).slice(0, 3)

  const upCount   = movers.filter(m => (m.changePct ?? 0) >= 0).length
  const total     = movers.length || 1
  const bullRatio = upCount / total
  const mood      = bullRatio >= 0.6 ? 'Bullish' : bullRatio <= 0.4 ? 'Bearish' : 'Neutral'
  const moodColor = mood === 'Bullish' ? '#22B585' : mood === 'Bearish' ? '#ef5454' : '#e3a234'
  const moodBorder = mood === 'Bullish'
    ? 'border-[#22B585]/20'
    : mood === 'Bearish'
    ? 'border-[#ef5454]/20'
    : 'border-[#e3a234]/20'
  const upPct   = Math.round(bullRatio * 100)
  const downPct = 100 - upPct

  return (
    <div className="w-full flex flex-col gap-4 animate-enter">

      {/* ── Indices bar ── */}
      <div className="w-full glass-card rounded-2xl overflow-hidden">
        <div className="flex divide-x divide-[#1a2e1f]">
          {(data.indices ?? []).map(idx => (
            <IndexTile key={idx.symbol} {...idx} />
          ))}
        </div>
      </div>

      {/* ── Movers + Sentiment ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* Top Movers */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 flex flex-col gap-4">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Top Movers</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
            <div>
              <p className="text-[9px] font-bold text-[#22B585] uppercase tracking-widest mb-2">Gainers</p>
              {gainers.map((m, i) => <MoverRow key={m.symbol} {...m} rank={i + 1} />)}
            </div>
            <div className="mt-4 sm:mt-0">
              <p className="text-[9px] font-bold text-[#ef5454] uppercase tracking-widest mb-2">Losers</p>
              {losers.map((m, i) => <MoverRow key={m.symbol} {...m} rank={i + 1} />)}
            </div>
          </div>
        </div>

        {/* Market Sentiment */}
        <div className={`bg-[var(--c-card)] border ${moodBorder} rounded-2xl p-5 flex flex-col gap-4`}>
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Market Sentiment</span>
          <span className="text-5xl font-black leading-none" style={{ color: moodColor }}>{mood}</span>
          <p className="text-xs text-[var(--c-text-faint)] leading-relaxed">
            {upCount} of {total} tracked stocks are up today
          </p>
          <div className="flex h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#22B585] transition-all duration-700" style={{ width: `${upPct}%` }} />
            <div className="bg-[#ef5454] transition-all duration-700" style={{ width: `${downPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--c-text-faint)]">
            <span className="text-[#22B585]">{upPct}% up</span>
            <span className="text-[#ef5454]">{downPct}% down</span>
          </div>
        </div>

      </div>

      {/* Footer — data freshness */}
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] text-[var(--c-text-fainter)] inline-flex items-center">
          Prices delayed
          <InfoTooltip side="top">
            Indices, movers, and sentiment are aggregated from Finnhub. Quotes may be 15-min delayed depending on exchange. Auto-refreshes every 60s.
          </InfoTooltip>
        </span>
        {fetchedAt && <DataTimestamp asOf={fetchedAt} source="Finnhub" />}
      </div>
    </div>
  )
}
