export async function fetchMarket(ticker) {
  const res = await fetch(`/api/market?ticker=${encodeURIComponent(ticker)}`)
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}))
    throw new Error(error ?? `Market API ${res.status}`)
  }
  const data = await res.json() // { quote, profile, metrics, candles, synthetic?, news? }
  return { ...data, fetchedAt: Date.now() }
}
