import { useEffect, useState } from 'react'

function fmtPrice(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${Number(n).toFixed(2)}`
}

function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return Number(n).toLocaleString()
}

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(0)}%`
}

function fmtExpiry(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return '—'
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function TypeBadge({ type }) {
  const isCall = type === 'call'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-widest ${
      isCall
        ? 'bg-[#22B585]/10 text-[#22B585]'
        : 'bg-[#ef5454]/10 text-[#ef5454]'
    }`}>
      {isCall ? 'Call' : 'Put'}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-fade">
      <div className="h-3 w-32 rounded-full shimmer" />
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="h-8 rounded-lg shimmer" />
      ))}
    </div>
  )
}

function EmptyState({ ticker, reason }) {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">
        Options Chain{ticker && <span className="text-[var(--c-text-fainter)] font-normal ml-1.5">· {ticker}</span>}
      </span>
      <div className="border border-[var(--c-border)] bg-[var(--c-input-bg)] rounded-xl p-4 sm:p-5 flex flex-col items-center gap-2 text-center">
        <span className="text-[var(--c-text-fainter)] text-lg leading-none">◇</span>
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
          Options data unavailable
        </span>
        <p className="text-[11px] text-[var(--c-text-fainter)] max-w-[300px] leading-relaxed">
          {reason ?? (
            <>Polygon didn't return any listed contracts for {ticker ?? 'this ticker'} within our strike / expiry window. Some smaller tickers and non-optionable securities have no chain.</>
          )}
        </p>
      </div>
    </div>
  )
}

export default function OptionsScanner({ ticker, currentPrice }) {
  const [payload, setPayload] = useState(null)  // { chain, hasLiveData }
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!ticker || !currentPrice) { setPayload(null); return }

    // Reset immediately on ticker/price change so the previous ticker's
    // data can never render for a moment during the fetch.
    setPayload(null)
    setError(null)
    setLoading(true)

    const controller = new AbortController()
    fetch(`/api/options?symbol=${encodeURIComponent(ticker)}&price=${currentPrice}&mode=chain`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`options ${r.status}`)))
      .then(data => setPayload({ chain: data.chain ?? [], hasLiveData: data.hasLiveData ?? false }))
      .catch(err => {
        if (err?.name === 'AbortError') return
        setError(err?.message ?? 'Failed to load options')
        setPayload({ chain: [], hasLiveData: false })
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [ticker, currentPrice])

  if (loading) return <Skeleton />
  if (!payload) return null
  const { chain, hasLiveData } = payload
  if (!chain.length) return <EmptyState ticker={ticker} reason={error} />

  const unusualCount = chain.filter(c => c.unusual).length
  const callCount    = chain.filter(c => c.type === 'call').length
  const putCount     = chain.filter(c => c.type === 'put').length

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-enter">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">
            Options Chain
            {ticker && <span className="text-[var(--c-text-fainter)] font-normal ml-1.5">· {ticker}</span>}
          </span>
          {unusualCount > 0 && (
            <span className="text-[10px] font-bold text-[#e3a234] bg-[#e3a234]/10 border border-[#e3a234]/25 px-2 py-0.5 rounded-full">
              ⚡ {unusualCount} unusual
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--c-text-faint)]">
          {callCount} calls · {putCount} puts{hasLiveData ? ' · sorted by OI' : ''}
        </span>
      </div>

      {!hasLiveData && (
        <div className="border border-[#e3a234]/25 bg-[#e3a234]/8 rounded-lg p-3 flex gap-2 text-[11px] leading-relaxed text-[var(--c-text)]/85">
          <span className="text-[#e3a234] shrink-0">ⓘ</span>
          <span>
            <strong>Live premium and open-interest data is not available on this Polygon tier.</strong>{' '}
            Showing listed contract strikes and expiries only — verify pricing, OI, and IV
            with your broker before trading.
          </span>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--c-border)]">
              <th className="text-left pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Type</th>
              <th className="text-right pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Strike</th>
              <th className="text-left pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Expiry</th>
              <th className="text-right pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Open Int.</th>
              <th className="text-right pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Volume</th>
              <th className="text-right pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">IV</th>
              <th className="text-right pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Premium</th>
              <th className="text-right pb-2.5 text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Flag</th>
            </tr>
          </thead>
          <tbody>
            {chain.slice(0, 16).map((opt) => (
              <tr
                key={opt.ticker}
                className={`border-b border-[var(--c-border)]/60 last:border-0 ${opt.unusual ? 'bg-[#e3a234]/5' : ''}`}
              >
                <td className="py-2.5 pr-3"><TypeBadge type={opt.type} /></td>
                <td className="py-2.5 pr-3 text-right font-semibold text-[var(--c-text)] tabular-nums">{fmtPrice(opt.strike)}</td>
                <td className="py-2.5 pr-3 text-[var(--c-text)]">{fmtExpiry(opt.expiry)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--c-text)]">{fmtInt(opt.openInterest)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--c-text-faint)]">{fmtInt(opt.volume)}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-[var(--c-text-faint)]">{fmtPct(opt.iv)}</td>
                <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-[var(--c-text)]">{fmtPrice(opt.premium)}</td>
                <td className="py-2.5 pl-3 text-right">
                  {opt.unusual ? (
                    <span className="text-[9px] font-bold text-[#e3a234]">⚡ {opt.volOiRatio.toFixed(1)}× OI</span>
                  ) : (
                    <span className="text-[9px] text-[var(--c-text-fainter)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[var(--c-text-fainter)] leading-relaxed border-t border-[var(--c-border)] pt-3">
        {hasLiveData
          ? <>Live chain via Polygon.io · premiums are bid/ask midpoint · unusual flag = volume ≥ 60% of open interest (or ≥ 2 K contracts at 30%+)</>
          : <>Contract listings via Polygon.io · premium, open interest, volume, and IV require a paid options data tier</>
        }
      </p>
    </div>
  )
}
