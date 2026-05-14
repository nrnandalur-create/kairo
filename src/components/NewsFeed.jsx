const SENTIMENT = {
  positive: 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/25',
  negative: 'bg-[#e55353]/10 text-[#e55353] border-[#e55353]/25',
  neutral: 'bg-gray-700/30 text-gray-500 border-gray-600/20',
}

function NewsItem({ item }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-[#1e2d28] last:border-0">
      <div className="flex items-start gap-3 justify-between">
        <p className="text-sm text-gray-200 leading-snug flex-1">{item.headline}</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 uppercase tracking-wider ${SENTIMENT[item.sentiment]}`}>
          {item.sentiment}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-600">
        <span>{item.source}</span><span>·</span><span>{item.time}</span>
      </div>
    </div>
  )
}

export default function NewsFeed({ data }) {
  if (!data?.length) return null
  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">News Feed</span>
        <span className="text-[10px] text-gray-700 bg-[#111a17] px-2 py-1 rounded">Demo data · live feed requires news API</span>
      </div>
      <div>{data.map((item, i) => <NewsItem key={i} item={item} />)}</div>
    </div>
  )
}
