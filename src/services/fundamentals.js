export async function fetchFundamentals(ticker) {
  const r = await fetch(`/api/fundamentals?symbol=${encodeURIComponent(ticker)}`)
  if (!r.ok) throw new Error(r.status)
  const data = await r.json()
  return { ...data, fetchedAt: Date.now() }
}
