export async function fetchMarket(ticker) {
  const res = await fetch(`/api/market?ticker=${encodeURIComponent(ticker)}`)
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}))
    throw new Error(error ?? `Market API ${res.status}`)
  }
  return res.json() // { quote, profile, metrics, candles }
}
