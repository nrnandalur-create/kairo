const SENTIMENT_STYLES = {
  positive: 'bg-[#1D9E75]/15 text-[#1D9E75] border border-[#1D9E75]/30',
  negative: 'bg-[#e55353]/15 text-[#e55353] border border-[#e55353]/30',
  neutral: 'bg-gray-700/50 text-gray-400 border border-gray-600/30',
}

function NewsItem({ item }) {
  return (
    <div className="flex flex-col gap-2 py-3 border-b border-[#2e3347] last:border-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-200 leading-snug flex-1">{item.headline}</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${SENTIMENT_STYLES[item.sentiment]}`}>
          {item.sentiment}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{item.source}</span>
        <span>·</span>
        <span>{item.time}</span>
      </div>
    </div>
  )
}

export default function NewsFeed({ data }) {
  if (!data?.length) return null

  return (
    <div className="w-full bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">News Feed</h2>
      <div>
        {data.map((item, i) => (
          <NewsItem key={i} item={item} />
        ))}
      </div>
    </div>
  )
}
