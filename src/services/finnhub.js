// `signal` — optional AbortSignal from the caller. When the user searches a
// new ticker before this response returns, App.jsx aborts the previous
// controller and this fetch throws with err.name === 'AbortError'; the
// caller filters those out so stale results never overwrite fresh state.
export async function fetchMarket(ticker, { signal } = {}) {
  const res = await fetch(`/api/market?ticker=${encodeURIComponent(ticker)}`, { signal })
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}))
    throw new Error(error ?? `Market API ${res.status}`)
  }
  const data = await res.json() // { quote, profile, metrics, candles, synthetic?, news? }
  return { ...data, fetchedAt: Date.now() }
}
