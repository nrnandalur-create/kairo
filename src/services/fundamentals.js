export async function fetchFundamentals(ticker) {
  const r = await fetch(`/api/fundamentals?symbol=${encodeURIComponent(ticker)}`)
  if (!r.ok) throw new Error(r.status)
  return r.json()
}
