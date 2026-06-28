import { rateLimit } from '../lib/rateLimit.js'
import { validateTicker } from '../lib/validate.js'

// Extract the `.raw` numeric value from a Yahoo Finance field object
function raw(field) { return field?.raw ?? null }

function tsToDate(ts) {
  if (!ts) return null
  return new Date(ts * 1000).toISOString().split('T')[0]
}

function tsToQuarter(ts) {
  if (!ts) return null
  return Math.ceil((new Date(ts * 1000).getMonth() + 1) / 3)
}

function tsToYear(ts) {
  if (!ts) return null
  return new Date(ts * 1000).getFullYear()
}

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const ticker = validateTicker(req.query.symbol)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker' })

  const finnhubKey = process.env.FINNHUB_API_KEY

  // Yahoo Finance: all needed modules in one request (no API key required)
  const yfUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}` +
    `?modules=financialData%2CrecommendationTrend%2CcalendarEvents%2CearningsHistory`

  const [yfRes, insRes] = await Promise.allSettled([
    fetch(yfUrl, { headers: YF_HEADERS }),
    finnhubKey
      ? fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${ticker}&token=${finnhubKey}`)
      : Promise.resolve(null),
  ])

  let earnings = null
  let targets  = null

  if (yfRes.status === 'fulfilled' && yfRes.value?.ok) {
    try {
      const json   = await yfRes.value.json()
      const result = json?.quoteSummary?.result?.[0]

      if (result) {
        // ── Price targets + analyst consensus ──────────────────────────────
        const fd    = result.financialData ?? {}
        const trend = result.recommendationTrend?.trend?.[0] ?? {}

        if (raw(fd.targetMeanPrice) || raw(fd.targetHighPrice)) {
          targets = {
            targetMean:         raw(fd.targetMeanPrice),
            targetMedian:       raw(fd.targetMedianPrice),
            targetHigh:         raw(fd.targetHighPrice),
            targetLow:          raw(fd.targetLowPrice),
            numberOfAnalysts:   raw(fd.numberOfAnalystOpinions),
            recommendationKey:  fd.recommendationKey  ?? null,
            recommendationMean: raw(fd.recommendationMean),
            trend: {
              strongBuy:  trend.strongBuy  ?? 0,
              buy:        trend.buy        ?? 0,
              hold:       trend.hold       ?? 0,
              sell:       trend.sell       ?? 0,
              strongSell: trend.strongSell ?? 0,
            },
          }
        }

        // ── Earnings calendar ──────────────────────────────────────────────
        const cal  = result.calendarEvents?.earnings ?? {}
        const hist = result.earningsHistory?.history  ?? []

        const list = []

        // Upcoming quarter from calendarEvents
        const nextTs = cal.earningsDate?.[0]?.raw
        if (nextTs) {
          list.push({
            date:        tsToDate(nextTs),
            epsActual:   null,
            epsEstimate: raw(cal.earningsAverage),
            epsLow:      raw(cal.earningsLow),
            epsHigh:     raw(cal.earningsHigh),
            quarter:     tsToQuarter(nextTs),
            year:        tsToYear(nextTs),
          })
        }

        // Historical quarters from earningsHistory (Yahoo returns oldest first)
        for (const h of [...hist].reverse()) {
          const ts = raw(h.quarter)
          list.push({
            date:        tsToDate(ts),
            epsActual:   raw(h.epsActual),
            epsEstimate: raw(h.epsEstimate),
            quarter:     tsToQuarter(ts),
            year:        tsToYear(ts),
          })
        }

        // Sort descending (newest first), deduplicate by date
        list.sort((a, b) => (a.date ?? '') < (b.date ?? '') ? 1 : -1)
        const seen = new Set()
        const deduped = list.filter(e => {
          if (!e.date || seen.has(e.date)) return false
          seen.add(e.date)
          return true
        })

        if (deduped.length) earnings = deduped
      }
    } catch {}
  }

  // ── Insider trades (Finnhub, optional) ────────────────────────────────────
  let insider = null
  if (insRes.status === 'fulfilled' && insRes.value?.ok) {
    try {
      const d = await insRes.value.json()
      insider = (d.data ?? [])
        .filter(t => t.transactionCode === 'P' || t.transactionCode === 'S')
        .slice(0, 10)
    } catch {}
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
  res.json({ earnings, targets, insider })
}
