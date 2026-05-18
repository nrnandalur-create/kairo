import { rateLimit } from './_rateLimit.js'
import { validateTicker } from './_validate.js'

function isoDate(d) {
  return d.toISOString().split('T')[0]
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const ticker = validateTicker(req.query.symbol)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker' })

  const key = process.env.FINNHUB_API_KEY
  if (!key) return res.status(500).json({ error: 'Service unavailable' })

  const now  = new Date()
  const from = new Date(now); from.setMonth(from.getMonth() - 3)
  const to   = new Date(now); to.setMonth(to.getMonth() + 9)

  const [earR, tgtR, insR] = await Promise.allSettled([
    fetch(`https://finnhub.io/api/v1/earnings-calendar?symbol=${ticker}&from=${isoDate(from)}&to=${isoDate(to)}&token=${key}`),
    fetch(`https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${key}`),
    fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${ticker}&token=${key}`),
  ])

  let earnings = null
  if (earR.status === 'fulfilled' && earR.value.ok) {
    try {
      const d = await earR.value.json()
      earnings = (d.earningsCalendar ?? []).sort((a, b) => new Date(b.date) - new Date(a.date))
    } catch {}
  }

  let targets = null
  if (tgtR.status === 'fulfilled' && tgtR.value.ok) {
    try {
      const d = await tgtR.value.json()
      if (d.targetMean || d.targetMedian || d.targetHigh) targets = d
    } catch {}
  }

  let insider = null
  if (insR.status === 'fulfilled' && insR.value.ok) {
    try {
      const d = await insR.value.json()
      insider = (d.data ?? [])
        .filter(t => t.transactionCode === 'P' || t.transactionCode === 'S')
        .slice(0, 10)
    } catch {}
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
  res.json({ earnings, targets, insider })
}
