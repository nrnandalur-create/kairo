export async function fetchMarketPulse() {
  const r = await fetch('/api/market-pulse')
  if (!r.ok) throw new Error(`market-pulse ${r.status}`)
  return r.json()
}
