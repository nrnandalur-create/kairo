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
// Uses Polygon's contracts + per-contract snapshot endpoints — the same
// pair the covered-call path uses because they work on the free tier.
// Bugfix from the first version: previously the nearest-strike sort
// collapsed onto ONE strike with many weekly + daily expiries. Now we
// dedupe by strike first (keeping the shortest-dated contract per
// unique strike), so 12 sampled contracts cover 12 different strikes.
async function fetchOptionsChain({ ticker, price, key, res }) {
  const fridays  = getNextFridays(6)
  const today    = fridays[0]
  const sixWeeks = fridays[5]

  const minStrike = price * 0.70
  const maxStrike = price * 1.30

  const fetchSide = async (side) => {
    const url = `https://api.polygon.io/v3/reference/options/contracts` +
      `?underlying_ticker=${ticker}&contract_type=${side}` +
      `&expiration_date.gte=${today}&expiration_date.lte=${sixWeeks}` +
      `&strike_price.gte=${minStrike.toFixed(2)}&strike_price.lte=${maxStrike.toFixed(2)}` +
      `&limit=250&apiKey=${key}`
    try {
      const r = await fetch(url)
      if (!r.ok) return []
      const d = await r.json()
      return d.results ?? []
    } catch {
      return []
    }
  }

  const [calls, puts] = await Promise.all([fetchSide('call'), fetchSide('put')])

  if (!calls.length && !puts.length) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.json({ chain: [], underlyingPrice: price })
  }

  // Dedupe by strike — for each unique strike, keep the contract with
  // the SHORTEST expiry (fresh weeklies are usually the most-traded).
  // This prevents 12 same-strike duplicates from crowding out the sample.
  const dedupeByStrike = (contracts) => {
    const bestByStrike = new Map()
    for (const c of contracts) {
      const key = c.strike_price
      const prev = bestByStrike.get(key)
      if (!prev || c.expiration_date < prev.expiration_date) bestByStrike.set(key, c)
    }
    return Array.from(bestByStrike.values())
  }

  const uniqCalls = dedupeByStrike(calls)
    .sort((a, b) => Math.abs(a.strike_price - price) - Math.abs(b.strike_price - price))
    .slice(0, 10)
  const uniqPuts = dedupeByStrike(puts)
    .sort((a, b) => Math.abs(a.strike_price - price) - Math.abs(b.strike_price - price))
    .slice(0, 10)

  const sample = [...uniqCalls, ...uniqPuts]

  // Snapshot each sampled contract to get real OI/volume/IV/premium.
  // 20 parallel snapshot calls is under Polygon free-tier limits.
  const snapshots = await Promise.allSettled(
    sample.map(c =>
      fetch(`https://api.polygon.io/v3/snapshot/options/${ticker}/${encodeURIComponent(c.ticker)}?apiKey=${key}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  )

  const chain = sample
    .map((c, i) => {
      const result = snapshots[i]
      const snap = result.status === 'fulfilled' ? result.value?.results : null
      const lq  = snap?.last_quote ?? {}
      const day = snap?.day ?? {}
      const gr  = snap?.greeks ?? {}

      let premium = null
      if (lq.bid != null && lq.ask != null && lq.ask > 0) {
        premium = +(((lq.bid + lq.ask) / 2)).toFixed(2)
      } else if (day.close != null && day.close > 0) {
        premium = +day.close.toFixed(2)
      }

      const openInterest = snap?.open_interest ?? 0
      const volume       = day.volume ?? 0
      const volOiRatio   = openInterest > 0 ? volume / openInterest : 0
      const unusual = openInterest >= 50 && (
        volOiRatio >= 0.6 ||
        (volume >= 2000 && volOiRatio >= 0.3)
      )

      return {
        type:         c.contract_type,
        strike:       c.strike_price,
        expiry:       c.expiration_date,
        ticker:       c.ticker,
        premium,
        bid:          lq.bid ?? null,
        ask:          lq.ask ?? null,
        openInterest,
        volume,
        iv:           snap?.implied_volatility ?? gr.implied_volatility ?? null,
        delta:        gr.delta ?? null,
        volOiRatio:   +volOiRatio.toFixed(2),
        unusual,
      }
    })
    // Keep contracts that have SOME activity, else premium data. If OI and
    // vol are both zero AND premium is null, the contract is effectively
    // dead — better to hide it than render a row of dashes.
    .filter(c => c.openInterest > 0 || c.volume > 0 || c.premium != null)
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
