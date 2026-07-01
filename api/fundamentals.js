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
  const polygonKey = process.env.POLYGON_API_KEY

  // Yahoo Finance: all needed modules in one request (no API key required)
  const yfUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}` +
    `?modules=financialData%2CrecommendationTrend%2CcalendarEvents%2CearningsHistory`

  // Long-range monthly bars for the ATH/ATL price-position badge. Polygon
  // caps free-tier history at 2 years; if that returns empty or errors we
  // fall through to Yahoo which has decades. Both endpoints are called
  // in parallel with the existing Yahoo/Finnhub work so the overall
  // fundamentals response latency is unchanged.
  const today = new Date().toISOString().split('T')[0]
  const polyUrl = polygonKey
    ? `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/month/1970-01-01/${today}?adjusted=true&sort=asc&limit=1000&apiKey=${polygonKey}`
    : null

  const [yfRes, insRes, polyRes] = await Promise.allSettled([
    fetch(yfUrl, { headers: YF_HEADERS }),
    finnhubKey
      ? fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${ticker}&token=${finnhubKey}`)
      : Promise.resolve(null),
    polyUrl
      ? fetch(polyUrl)
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

  // ── Price range (ATH / ATL) ──────────────────────────────────────────────
  // Computed from the widest history we can get. Polygon-first (matches the
  // spec) with a Yahoo fallback for the deeper history free tier can't reach.
  let priceRange = null
  const findExtremes = (bars, getHigh, getLow, getTime) => {
    let hi = -Infinity, lo = Infinity, hiT = null, loT = null
    for (const b of bars) {
      const h = getHigh(b), l = getLow(b), t = getTime(b)
      if (h != null && h > hi) { hi = h; hiT = t }
      if (l != null && l > 0 && l < lo) { lo = l; loT = t }
    }
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null
    return { ath: +hi.toFixed(2), atl: +lo.toFixed(2), athDate: hiT, atlDate: loT }
  }

  // Polygon path (respects the user's explicit "Polygon aggregate endpoint" ask)
  if (polyRes.status === 'fulfilled' && polyRes.value?.ok) {
    try {
      const d = await polyRes.value.json()
      const bars = Array.isArray(d.results) ? d.results : []
      if (bars.length) {
        priceRange = findExtremes(
          bars,
          b => b.h,
          b => b.l,
          b => b.t ? new Date(b.t).toISOString().split('T')[0] : null,
        )
      }
    } catch { /* fall through to Yahoo */ }
  }

  // Yahoo fallback — decades of monthly bars, no API key required. Only
  // fires when Polygon returned nothing or errored. Kept behind a dynamic
  // import so the happy Polygon path doesn't pay the module init cost.
  if (!priceRange) {
    try {
      const { default: yahooFinance } = await import('yahoo-finance2')
      try {
        if (typeof yahooFinance.suppressNotices === 'function') {
          yahooFinance.suppressNotices(['ripHistorical', 'yahooSurvey'])
        }
      } catch {}
      const chart = await yahooFinance.chart(ticker, {
        period1:  new Date('1970-01-01'),
        interval: '1mo',
      }).catch(() => null)
      const bars = chart?.quotes ?? []
      if (bars.length) {
        priceRange = findExtremes(
          bars,
          b => b.high ?? b.close,
          b => b.low  ?? b.close,
          b => b.date ? new Date(b.date).toISOString().split('T')[0] : null,
        )
      }
    } catch { /* keep priceRange null so the UI falls back to 52W-only badge */ }
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200')
  res.json({ earnings, targets, insider, priceRange })
}
