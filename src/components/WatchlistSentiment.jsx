import { useState, useEffect } from 'react'
import { detectSentiment } from '../utils/sentiment'

export default function WatchlistSentiment({ tickers }) {
  const [counts,  setCounts]  = useState({ pos: 0, neg: 0, neu: 0 })
  const [loaded,  setLoaded]  = useState(0)
  const tickerKey = tickers.join(',')

  useEffect(() => {
    if (!tickers.length) return
    setCounts({ pos: 0, neg: 0, neu: 0 })
    setLoaded(0)

    tickers.forEach(async ticker => {
      try {
        const r = await fetch(`/api/news?ticker=${ticker}`)
        if (r.ok) {
          const { articles } = await r.json()
          if (Array.isArray(articles) && articles.length) {
            let pos = 0, neg = 0
            for (const a of articles) {
              const s = detectSentiment(a.headline)
              if (s === 'positive') pos++
              else if (s === 'negative') neg++
            }
            setCounts(prev => ({
              pos: prev.pos + pos,
              neg: prev.neg + neg,
              neu: prev.neu + articles.length - pos - neg,
            }))
          }
        }
      } catch {}
      setLoaded(prev => prev + 1)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey])

  const total      = counts.pos + counts.neg + counts.neu
  const isLoading  = loaded < tickers.length
  const bullPct    = total ? Math.round(counts.pos / total * 100) : 0
  const bearPct    = total ? Math.round(counts.neg / total * 100) : 0
  const neutPct    = 100 - bullPct - bearPct

  const mood      = bullPct >= bearPct + 15 ? 'Bullish'
                  : bearPct >= bullPct + 15 ? 'Bearish'
                  : 'Mixed'
  const moodColor = mood === 'Bullish' ? '#1D9E75'
                  : mood === 'Bearish' ? '#e24b4a'
                  : '#d4922a'

  if (!tickers.length) return null

  return (
    <div className="w-full glass-card rounded-2xl p-5 flex flex-col gap-3 animate-enter">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">
          Watchlist Sentiment
        </span>
        {isLoading && (
          <div className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#1D9E75] animate-pulse" />
            <span className="text-[10px] text-[#4b6358]">{loaded}/{tickers.length}</span>
          </div>
        )}
      </div>

      {!isLoading && total === 0 ? (
        <p className="text-xs text-[#4b6358]">No recent news found across your watchlist.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            {isLoading && total === 0 ? (
              <div className="h-7 w-24 rounded-full shimmer" />
            ) : (
              <>
                <span className="text-2xl font-black leading-none" style={{ color: moodColor }}>
                  {mood}
                </span>
                <span className="text-[10px] text-[#4b6358]">
                  {total} headline{total !== 1 ? 's' : ''} · {tickers.length} ticker{tickers.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          <div className="flex h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#1D9E75] transition-all duration-700" style={{ width: `${bullPct}%` }} />
            <div className="bg-[#e24b4a] transition-all duration-700" style={{ width: `${bearPct}%` }} />
            <div className="bg-[#1a2e1f] transition-all duration-700" style={{ width: `${neutPct}%` }} />
          </div>

          <div className="flex gap-4 text-[10px]">
            <span className="text-[#1D9E75]">{bullPct}% bull</span>
            <span className="text-[#e24b4a]">{bearPct}% bear</span>
            <span className="text-[#4b6358]">{neutPct}% neutral</span>
          </div>
        </>
      )}
    </div>
  )
}
