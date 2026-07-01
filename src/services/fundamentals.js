// `signal` — optional AbortSignal from the caller (App.jsx). Aborted when
// the user switches tickers so an in-flight fundamentals fetch can't
// overwrite the fresh ticker's state.
export async function fetchFundamentals(ticker, { signal } = {}) {
  const r = await fetch(`/api/fundamentals?symbol=${encodeURIComponent(ticker)}`, { signal })
  if (!r.ok) throw new Error(r.status)
  const data = await r.json()
  return { ...data, fetchedAt: Date.now() }
}
