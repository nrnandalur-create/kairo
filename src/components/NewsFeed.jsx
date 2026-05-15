const SENTIMENT = {
  positive: {
    dot:   'bg-[#1D9E75]',
    badge: 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25',
    label: 'Positive',
  },
  negative: {
    dot:   'bg-[#e24b4a]',
    badge: 'bg-[#e24b4a]/10 text-[#e24b4a] border-[#e24b4a]/25',
    label: 'Negative',
  },
  neutral: {
    dot:   'bg-[#4b6358]',
    badge: 'bg-[#1a2e1f] text-[#4b6358] border-[#1a2e1f]',
    label: 'Neutral',
  },
}

function NewsCard({ item }) {
  const s = SENTIMENT[item.sentiment] ?? SENTIMENT.neutral
  return (
    <div className="flex gap-3 py-3.5 border-b border-[#1a2e1f] last:border-0">
      {/* Sentiment dot */}
      <div className="mt-1.5 shrink-0">
        <span className={`block w-1.5 h-1.5 rounded-full ${s.dot}`} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        <p className="text-sm text-[#d1d9d5] leading-snug">{item.headline}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-[#4b6358]">{item.source}</span>
          <span className="text-[10px] text-[#1a2e1f]">·</span>
          <span className="text-[10px] text-[#4b6358]">{item.time}</span>
        </div>
      </div>

      {/* Sentiment badge */}
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest self-start shrink-0 ${s.badge}`}>
        {s.label}
      </span>
    </div>
  )
}

export default function NewsFeed({ data }) {
  if (!data?.length) return null

  const counts = data.reduce(
    (acc, item) => {
      acc[item.sentiment] = (acc[item.sentiment] ?? 0) + 1
      return acc
    },
    {}
  )
  const total    = data.length
  const bullPct  = Math.round((counts.positive ?? 0) / total * 100)
  const bearPct  = Math.round((counts.negative ?? 0) / total * 100)

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl p-6 flex flex-col gap-4 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">News Feed</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] inline-block" /><span className="text-[#4b6358]">{bullPct}% bull</span></span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#e24b4a] inline-block" /><span className="text-[#4b6358]">{bearPct}% bear</span></span>
          </div>
          <span className="text-[10px] text-[#4b6358] bg-[#0a0f0d] border border-[#1a2e1f] px-2.5 py-1 rounded-lg">
            Demo · live feed requires news API
          </span>
        </div>
      </div>

      {/* Sentiment bar */}
      <div className="flex h-1 rounded-full overflow-hidden gap-px">
        <div className="bg-[#1D9E75] rounded-l-full" style={{ width: `${bullPct}%` }} />
        <div className="bg-[#e24b4a] rounded-r-full" style={{ width: `${bearPct}%` }} />
        <div className="bg-[#1a2e1f] flex-1" />
      </div>

      {/* News items */}
      <div>{data.map((item, i) => <NewsCard key={i} item={item} />)}</div>
    </div>
  )
}
