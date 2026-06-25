import { detectSentiment } from '../utils/sentiment'
import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'

function fmtTime(ts) {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000 / 60)
  if (diff < 60) return `${diff}m ago`
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}h ago`
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const SENTIMENT = {
  positive: {
    dot:   'bg-[#22B585]',
    badge: 'bg-[#22B585]/10 text-[#22B585] border-[#22B585]/25',
    label: 'Positive',
  },
  negative: {
    dot:   'bg-[#ef5454]',
    badge: 'bg-[#ef5454]/10 text-[#ef5454] border-[#ef5454]/25',
    label: 'Negative',
  },
  neutral: {
    dot:   'bg-[#4b6358]',
    badge: 'bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] border-[var(--c-border)]',
    label: 'Neutral',
  },
}

function NewsCard({ item }) {
  const sentiment = detectSentiment(item.headline)
  const s = SENTIMENT[sentiment]
  return (
    <div className="flex gap-3 py-3.5 border-b border-[var(--c-border)] last:border-0 -mx-2 px-2 rounded-lg hover:bg-[var(--c-hover-bg)] transition-colors duration-150">
      <div className="mt-1.5 shrink-0">
        <span className={`block w-1.5 h-1.5 rounded-full ${s.dot}`} />
      </div>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[var(--c-text)]/80 leading-snug hover:text-[var(--c-text-strong)] transition-colors duration-150"
          >
            {item.headline}
          </a>
        ) : (
          <p className="text-sm text-[var(--c-text)]/80 leading-snug">{item.headline}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[var(--c-text-faint)]">{item.source}</span>
          <span className="text-[10px] text-[#1a2e1f]">·</span>
          <span className="text-[10px] text-[var(--c-text-faint)]">{fmtTime(item.datetime)}</span>
        </div>
      </div>

      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest self-start shrink-0 ${s.badge}`}>
        {s.label}
      </span>
    </div>
  )
}

function NewsSkeleton() {
  return (
    <div className="w-full glass-card rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-20 rounded-full shimmer" />
        <div className="h-2.5 w-32 rounded-full shimmer" />
      </div>
      <div className="h-1 w-full rounded-full shimmer" />
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex gap-3 py-3 border-b border-[var(--c-border)] last:border-0">
          <div className="w-1.5 h-1.5 rounded-full shimmer shrink-0 mt-2" />
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 rounded-full shimmer w-full" />
            <div className="h-3 rounded-full shimmer w-4/5" />
            <div className="h-2.5 rounded-full shimmer w-24 mt-0.5" />
          </div>
          <div className="h-5 w-14 rounded-full shimmer shrink-0 self-start" />
        </div>
      ))}
    </div>
  )
}

export default function NewsFeed({ data, loading, asOf }) {
  if (loading) return <NewsSkeleton />

  if (!data?.length) return (
    <div className="w-full glass-card rounded-2xl p-6 flex flex-col gap-4 animate-enter">
      <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">News Feed</span>
      <div className="py-8 flex flex-col items-center gap-2 text-center">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-[#263d2c] mb-1">
          <rect x="2" y="3" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="2" y="8" width="9" height="2" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          <rect x="2" y="12" width="11" height="2" rx="1" stroke="currentColor" strokeWidth="1.3"/>
        </svg>
        <p className="text-xs text-[var(--c-text-faint)]">No recent news found for this ticker.</p>
      </div>
    </div>
  )

  const counts  = data.reduce((acc, item) => {
    const s = detectSentiment(item.headline)
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
  const total      = data.length
  const bullPct    = Math.round((counts.positive ?? 0) / total * 100)
  const bearPct    = Math.round((counts.negative ?? 0) / total * 100)
  const neutralPct = 100 - bullPct - bearPct

  return (
    <div className="w-full glass-card rounded-2xl p-6 flex flex-col gap-4 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center">
          News Feed
          <InfoTooltip>
            Headlines from Finnhub. Sentiment dots derived from keyword-based scoring of each headline (positive / negative / neutral).
          </InfoTooltip>
        </span>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22B585] inline-block" />
            <span className="text-[var(--c-text-faint)]">{bullPct}% bull</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ef5454] inline-block" />
            <span className="text-[var(--c-text-faint)]">{bearPct}% bear</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4b6358] inline-block" />
            <span className="text-[var(--c-text-faint)]">{neutralPct}% neutral</span>
          </span>
        </div>
      </div>

      {/* Sentiment bar */}
      <div className="flex h-1 rounded-full overflow-hidden gap-px">
        <div className="bg-[#22B585]" style={{ width: `${bullPct}%` }} />
        <div className="bg-[#ef5454]" style={{ width: `${bearPct}%` }} />
        <div className="bg-[var(--c-chip-bg)]" style={{ width: `${neutralPct}%` }} />
      </div>

      {/* News items */}
      <div>{data.map((item, i) => <NewsCard key={item.id ?? i} item={item} />)}</div>

      {/* Footer — data freshness */}
      {asOf && (
        <div className="flex items-center justify-end pt-2 -mb-1 border-t border-[var(--c-border)]/60">
          <DataTimestamp asOf={asOf} source="Finnhub" />
        </div>
      )}
    </div>
  )
}
