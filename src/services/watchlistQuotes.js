export async function fetchWatchlistQuotes(tickers) {
  if (!tickers.length) return []
  const r = await fetch(`/api/quotes?symbols=${tickers.join(',')}`)
  if (!r.ok) throw new Error(`quotes ${r.status}`)
  const d = await r.json()
  return d.quotes ?? []
}
