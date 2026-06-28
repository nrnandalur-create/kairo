// Lives in /lib (outside /api) so it doesn't count toward Vercel's serverless
// function quota. Imported by every /api/*.js handler that validates input.

// Ticker: 1-5 uppercase ASCII letters, optionally followed by `.` + 1-2
// letters for class-share notation (BRK.B, BRK.A, RDS.A). Covers all
// standard US equity + ETF symbols including dot-suffixed class shares.
const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/

export function validateTicker(raw) {
  if (typeof raw !== 'string') return null
  const sym = raw.trim().toUpperCase()
  return TICKER_RE.test(sym) ? sym : null
}

// Comma-separated list of tickers — each must pass TICKER_RE.
export function validateSymbolList(raw, maxCount = 20) {
  if (typeof raw !== 'string') return null
  const syms = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
  if (syms.length === 0 || syms.length > maxCount) return null
  if (!syms.every(s => TICKER_RE.test(s))) return null
  return syms
}

// Search query: 1–100 printable characters, no angle brackets or script chars.
const QUERY_RE = /^[a-zA-Z0-9\s&'.,\-]{1,100}$/

export function validateSearchQuery(raw) {
  if (typeof raw !== 'string') return null
  const q = raw.trim()
  return QUERY_RE.test(q) ? q : null
}
