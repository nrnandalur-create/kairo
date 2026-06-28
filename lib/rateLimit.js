// Sliding-window rate limiter — 30 requests per IP per minute.
// Uses a module-level Map that persists within a single Vercel function instance.
// Provides meaningful defense-in-depth; for strict enforcement add an external store.
//
// Lives in /lib (outside /api) so it doesn't count toward Vercel's serverless
// function quota. Imported by every /api/*.js handler.

const store   = new Map()   // ip → timestamp[]
const WINDOW  = 60_000      // ms
const LIMIT   = 30

function getIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers['x-real-ip'] ?? req.socket?.remoteAddress ?? 'unknown'
}

// Returns true if the request is allowed; sends 429 and returns false if not.
export function rateLimit(req, res) {
  const ip  = getIp(req)
  const now = Date.now()
  const cut = now - WINDOW

  const hits = (store.get(ip) ?? []).filter(t => t > cut)

  if (hits.length >= LIMIT) {
    res.setHeader('Retry-After', '60')
    res.setHeader('X-RateLimit-Limit', String(LIMIT))
    res.setHeader('X-RateLimit-Remaining', '0')
    res.status(429).json({ error: 'Too many requests. Please wait before trying again.' })
    return false
  }

  hits.push(now)
  store.set(ip, hits)
  res.setHeader('X-RateLimit-Limit', String(LIMIT))
  res.setHeader('X-RateLimit-Remaining', String(LIMIT - hits.length))
  return true
}
