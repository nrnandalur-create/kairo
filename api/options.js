import { rateLimit } from '../lib/rateLimit.js'
import { validateTicker } from '../lib/validate.js'

function getNextFridays(n = 4) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = today.getDay()
  const daysToFirst = day <= 4 ? 5 - day : 12 - day
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + daysToFirst + i * 7)
    return d.toISOString().split('T')[0]
  })
}

function daysDiff(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 86_400_000
}

function findBestMatch(contracts, targetStrike, targetExpiry) {
  const exact = contracts.filter(c => c.expiration_date === targetExpiry)
  const pool  = exact.length ? exact : contracts

  return pool.reduce((best, c) => {
    const dStrike = Math.abs(c.strike_price - targetStrike)
    const dExpiry = daysDiff(c.expiration_date, targetExpiry)
    const score   = dStrike + dExpiry * 0.5
    if (!best || score < best.score) return { contract: c, score }
    return best
  }, null)?.contract ?? null
}

// ── Full options-chain path ─────────────────────────────────────────────────
// Used by the OptionsScanner tab. One paginated call to Polygon's
// /v3/snapshot/options/{ticker} endpoint returns the full chain with
// live open interest, volume, greeks, and IV in a single response —
// much cheaper (1 request) and more accurate (real OI) than the
// previous approach of listing contracts then snapshotting them.
async function fetchOptionsChain({ ticker, price, key, res }) {
  const fridays  = getNextFridays(6)
  const today    = fridays[0]
  const sixWeeks = fridays[5]

  const minStrike = price * 0.70
  const maxStrike = price * 1.30

  // Pull up to 250 snapshots at a time — Polygon caps free tier here.
  // One call is enough for most tickers; if a very active ticker like
  // SPY has more, we still get the ~250 most relevant.
  const url = `https://api.polygon.io/v3/snapshot/options/${ticker}` +
    `?expiration_date.gte=${today}&expiration_date.lte=${sixWeeks}` +
    `&strike_price.gte=${minStrike.toFixed(2)}&strike_price.lte=${maxStrike.toFixed(2)}` +
    `&limit=250&apiKey=${key}`

  let snapshots = []
  try {
    const r = await fetch(url)
    if (r.ok) {
      const d = await r.json()
      snapshots = d.results ?? []
    }
  } catch {}

  if (!snapshots.length) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.json({ chain: [], underlyingPrice: price })
  }

  // Normalize each snapshot into our chain shape. Skip contracts with
  // zero open interest AND zero volume — they're dead listings that
  // add noise without insight.
  const normalized = snapshots
    .map(s => {
      const d   = s.details ?? {}
      const lq  = s.last_quote ?? {}
      const day = s.day ?? {}
      const gr  = s.greeks ?? {}

      let premium = null
      if (lq.bid != null && lq.ask != null && lq.ask > 0) {
        premium = +(((lq.bid + lq.ask) / 2)).toFixed(2)
      } else if (day.close != null && day.close > 0) {
        premium = +day.close.toFixed(2)
      }

      const openInterest = s.open_interest ?? 0
      const volume       = day.volume ?? 0
      const volOiRatio   = openInterest > 0 ? volume / openInterest : 0
      // Standard institutional heuristic for unusual activity.
      const unusual = openInterest >= 50 && (
        volOiRatio >= 0.6 ||
        (volume >= 2000 && volOiRatio >= 0.3)
      )

      return {
        type:         d.contract_type ?? null,
        strike:       d.strike_price ?? null,
        expiry:       d.expiration_date ?? null,
        ticker:       d.ticker ?? null,
        premium,
        bid:          lq.bid ?? null,
        ask:          lq.ask ?? null,
        openInterest,
        volume,
        iv:           s.implied_volatility ?? gr.implied_volatility ?? null,
        delta:        gr.delta ?? null,
        volOiRatio:   +volOiRatio.toFixed(2),
        unusual,
      }
    })
    .filter(c => c.type && c.strike != null && (c.openInterest > 0 || c.volume > 0))

  // Return the most liquid 8 calls + 8 puts, each pool sorted by
  // open interest descending — that's the shape traders actually
  // look at (biggest bets first, both directions).
  const calls = normalized.filter(c => c.type === 'call')
    .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
    .slice(0, 8)
  const puts = normalized.filter(c => c.type === 'put')
    .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
    .slice(0, 8)

  // Interleave so the table alternates types, biggest-OI first.
  const chain = [...calls, ...puts]
    .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
  return res.json({ chain, underlyingPrice: price, ticker })
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()

  const ticker = validateTicker(req.query.symbol)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker' })

  const price = parseFloat(req.query.price)
  if (!price || price <= 0) return res.status(400).json({ error: 'Invalid price' })

  const key = process.env.POLYGON_API_KEY
  // Both modes gracefully return an empty payload when Polygon isn't
  // configured — the callers show honest "options data unavailable"
  // states rather than an error.
  const mode = req.query.mode === 'chain' ? 'chain' : 'covered-call'
  if (!key) {
    if (mode === 'chain') return res.status(200).json({ chain: [], underlyingPrice: price })
    return res.status(200).json({ contracts: [] })
  }

  if (mode === 'chain') return fetchOptionsChain({ ticker, price, key, res })

  const fridays    = getNextFridays(4)
  const today      = fridays[0] // first expiry works as >=today bound
  const fourWeeks  = fridays[3]

  const STRIKES = [
    { pct: 0.10, label: '+10%' },
    { pct: 0.15, label: '+15%' },
    { pct: 0.20, label: '+20%' },
    { pct: 0.25, label: '+25%' },
  ]

  const minStrike = price * 1.08
  const maxStrike = price * 1.35

  let allContracts = []
  try {
    const url = `https://api.polygon.io/v3/reference/options/contracts` +
      `?underlying_ticker=${ticker}&contract_type=call` +
      `&expiration_date.gte=${today}&expiration_date.lte=${fourWeeks}` +
      `&strike_price.gte=${minStrike.toFixed(2)}&strike_price.lte=${maxStrike.toFixed(2)}` +
      `&limit=100&apiKey=${key}`

    const r = await fetch(url)
    if (r.ok) {
      const d = await r.json()
      allContracts = d.results ?? []
    }
  } catch {}

  if (!allContracts.length) return res.json({ contracts: [] })

  const targets = STRIKES.map(({ pct, label }, i) => ({
    label,
    targetStrike: price * (1 + pct),
    targetExpiry: fridays[i],
  }))

  const matched = targets.map(t => ({
    ...t,
    contract: findBestMatch(allContracts, t.targetStrike, t.targetExpiry),
  }))

  const uniqueTickers = [...new Set(matched.map(m => m.contract?.ticker).filter(Boolean))]

  const snapshots = await Promise.allSettled(
    uniqueTickers.map(ct =>
      fetch(`https://api.polygon.io/v3/snapshot/options/${ticker}/${encodeURIComponent(ct)}?apiKey=${key}`)
        .then(r => r.ok ? r.json() : null)
    )
  )

  const snapMap = {}
  uniqueTickers.forEach((ct, i) => {
    const result = snapshots[i]
    if (result.status === 'fulfilled' && result.value?.results) {
      snapMap[ct] = result.value.results
    }
  })

  const contracts = matched.map(({ label, targetStrike, targetExpiry, contract }) => {
    if (!contract) return { label, targetStrike, targetExpiry, real: false }

    const snap = snapMap[contract.ticker]
    const lq   = snap?.last_quote
    const d    = snap?.details ?? {}
    const gr   = snap?.greeks ?? {}

    let premium = null
    if (lq?.bid != null && lq?.ask != null && lq.ask > 0) {
      premium = +(((lq.bid + lq.ask) / 2)).toFixed(2)
    } else if (lq?.last_price != null) {
      premium = +lq.last_price.toFixed(2)
    }

    return {
      label,
      strike:       contract.strike_price,
      expiry:       contract.expiration_date,
      ticker:       contract.ticker,
      premium,
      bid:          lq?.bid   ?? null,
      ask:          lq?.ask   ?? null,
      openInterest: snap?.open_interest ?? null,
      iv:           snap?.implied_volatility ?? gr.implied_volatility ?? null,
      real:         premium != null,
    }
  })

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
  res.json({ contracts })
}
