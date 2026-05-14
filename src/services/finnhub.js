const BASE = 'https://finnhub.io/api/v1'
const key = () => import.meta.env.VITE_FINNHUB_API_KEY

async function get(path) {
  const res = await fetch(`${BASE}${path}&token=${key()}`)
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`)
  return res.json()
}

export async function getQuote(ticker) {
  return get(`/quote?symbol=${ticker}`)
}

export async function getProfile(ticker) {
  return get(`/stock/profile2?symbol=${ticker}`)
}

export async function getMetrics(ticker) {
  return get(`/stock/metric?symbol=${ticker}&metric=all`)
}

export async function getCandles(ticker) {
  const to = Math.floor(Date.now() / 1000)
  const from = to - 45 * 24 * 60 * 60 // 45 days to ensure ~30 trading days
  return get(`/stock/candle?symbol=${ticker}&resolution=D&from=${from}&to=${to}`)
}

export function formatCandles(raw) {
  if (!raw || raw.s !== 'ok') return []
  return raw.t.map((ts, i) => ({
    time: ts,
    open: raw.o[i],
    high: raw.h[i],
    low: raw.l[i],
    close: raw.c[i],
    volume: raw.v[i],
  }))
}
