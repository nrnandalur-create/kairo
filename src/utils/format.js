// Canonical formatters. Use these everywhere instead of inline toFixed/conversion
// so prices, percentages, and "X ago" timestamps read identically across the app.

const DASH = '—'
const isNum = n => n != null && Number.isFinite(Number(n))

// $1,234.56 — always 2-decimal price unless caller overrides.
export function fmtPrice(n, dec = 2) {
  if (!isNum(n)) return DASH
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
}

// 2.41%, -1.12% — sign-aware, includes the % glyph.
export function fmtPct(n, dec = 2) {
  if (!isNum(n)) return DASH
  const v = Number(n)
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(dec)}%`
}

// 42.3M, 1.2B, 712K — short volume formatting.
export function fmtVolume(n) {
  if (!isNum(n)) return DASH
  const v = Math.abs(Number(n))
  if (v >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `${(n / 1e9 ).toFixed(2)}B`
  if (v >= 1e6)  return `${(n / 1e6 ).toFixed(1)}M`
  if (v >= 1e3)  return `${(n / 1e3 ).toFixed(0)}K`
  return Number(n).toFixed(0)
}

// $1.2T, $324B, $42M — Finnhub returns marketCapitalization in millions of USD.
export function fmtCap(millions) {
  if (!isNum(millions)) return DASH
  const v = Number(millions)
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}T`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(2)}B`
  return `$${v.toFixed(0)}M`
}

// 1.45 / 28.6 / N/A — generic ratio formatter (P/E, beta, etc).
export function fmtRatio(n, dec = 2) {
  if (!isNum(n)) return DASH
  return Number(n).toFixed(dec)
}

// "just now" / "12s ago" / "3m ago" / "2h ago" / "1d ago"
export function fmtRelTime(asOf, now = Date.now()) {
  if (asOf == null) return ''
  const ms = now - (asOf instanceof Date ? asOf.getTime() : Number(asOf))
  if (ms < 0)         return 'just now'
  if (ms < 10_000)    return 'just now'
  if (ms < 60_000)    return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

// "14:32:18 ET" — wall-clock formatter for the LIVE clock.
// Uses Intl with the America/New_York time zone so it's correct regardless of viewer locale.
const ET_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false, timeZone: 'America/New_York',
})
export function fmtETClock(date = new Date()) {
  return `${ET_TIME_FMT.format(date)} ET`
}

// "14:32 ET" — minute precision for non-clock timestamps.
const ET_MIN_FMT = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'America/New_York',
})
export function fmtETMinute(date = new Date()) {
  return `${ET_MIN_FMT.format(date)} ET`
}
