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
  // Shape: { transactions: [...], sentiment: {...} } — the sentiment block
  // is computed server-side so the UI never has to loop 90 days of trades
  // on the client. ETFs and index funds have no reporting insiders, so
  // `transactions` will be an empty array — the UI shows an empty state.
  let insider = null
  if (insRes.status === 'fulfilled' && insRes.value?.ok) {
    try {
      const d = await insRes.value.json()
      // Keep only bona-fide buys (P = Purchase) and sells (S = Sale).
      // Skip grants/awards/exercises/gifts which distort sentiment.
      const all = (d.data ?? []).filter(
        t => t.transactionCode === 'P' || t.transactionCode === 'S'
      )
      // Newest first — Finnhub returns arbitrary order.
      all.sort((a, b) => {
        const da = a.transactionDate || a.filingDate || ''
        const db = b.transactionDate || b.filingDate || ''
        return db.localeCompare(da)
      })

      // 90-day sentiment window
      const cutoffMs = Date.now() - 90 * 86_400_000
      let buyShares = 0, sellShares = 0, buyValue = 0, sellValue = 0
      let buyerCount = 0, sellerCount = 0

      for (const t of all) {
        const dateStr = t.transactionDate || t.filingDate
        if (!dateStr) continue
        const dt = new Date(dateStr).getTime()
        if (Number.isNaN(dt) || dt < cutoffMs) continue

        const shares = Math.abs(Number(t.change) || 0)
        const price  = Number(t.transactionPrice) || 0
        const value  = shares * price

        if (t.transactionCode === 'P') {
          buyShares += shares
          buyValue  += value
          buyerCount++
        } else if (t.transactionCode === 'S') {
          sellShares += shares
          sellValue  += value
          sellerCount++
        }
      }

      const netValue = buyValue - sellValue
      const totalActivity = buyValue + sellValue
      const netBias = totalActivity === 0
        ? 'flat'
        : netValue > 0 ? 'buyer' : netValue < 0 ? 'seller' : 'flat'

      insider = {
        transactions: all.slice(0, 25).map(t => ({
          name:             t.name             ?? null,
          // Finnhub's position field is inconsistently named across endpoints.
          // Try both then leave null so the UI can gracefully omit it.
          title:            t.position ?? t.insiderTitle ?? null,
          transactionCode:  t.transactionCode,
          transactionType:  t.transactionCode === 'P' ? 'Buy' : 'Sell',
          shares:           Math.abs(Number(t.change) || 0),
          transactionPrice: Number(t.transactionPrice) || null,
          value:            Math.abs(Number(t.change) || 0) * (Number(t.transactionPrice) || 0),
          transactionDate:  t.transactionDate || t.filingDate,
        })),
        sentiment: {
          windowDays:  90,
          netBias,             // 'buyer' | 'seller' | 'flat'
          netValue,            // signed USD
          buyValue,
          sellValue,
          buyShares,
          sellShares,
          buyerCount,
          sellerCount,
          totalTransactions: buyerCount + sellerCount,
        },
      }
    } catch { /* keep insider null so UI shows empty state */ }
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
  res.json({ earnings, targets, insider })
}
