// ── EMA helper ────────────────────────────────────────────────────────────────
function ema(values, period) {
  const k = 2 / (period + 1)
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
}

// Build the closes array used by RSI/MACD/BB. When a live `currentPrice` is
// supplied (and meaningfully different from the most recent daily close),
// we treat it as the in-progress "today" bar — this is how Finviz,
// TradingView, and Stocktwits show intraday indicator values. Without this,
// the displayed RSI lags by one trading session and reads as "drift" vs
// a reference site loaded at the same moment.
//
// Logic:
//   - If `candles[-1].time` is from today (UTC) → replace its close
//     (intraday tick on a day we already have a candle for).
//   - Otherwise → append a new "today" close so the smoother gets one
//     more iteration (typical case during a regular session before the
//     close).
function effectiveCloses(candles, currentPrice) {
  const closes = candles.map(c => c.close)
  if (currentPrice == null || !Number.isFinite(currentPrice)) return closes
  const last = closes[closes.length - 1]
  if (Math.abs(currentPrice - last) < 0.01) return closes

  const todayDate    = new Date().toISOString().slice(0, 10)
  const lastBarDate  = new Date(candles[candles.length - 1].time * 1000)
    .toISOString().slice(0, 10)

  if (lastBarDate === todayDate) {
    return [...closes.slice(0, -1), currentPrice]
  }
  return [...closes, currentPrice]
}

// ── RSI (14-period, Wilder's RMA, intraday-aware) ─────────────────────────────
export function calcRSI(candles, period = 14, currentPrice = null) {
  const closes = effectiveCloses(candles, currentPrice)
  if (closes.length < period + 1) return null
  const changes = closes.slice(1).map((c, i) => c - closes[i])
  let avgGain = 0, avgLoss = 0
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]; else avgLoss += Math.abs(changes[i])
  }
  avgGain /= period; avgLoss /= period
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period
  }
  if (avgLoss === 0) return 100
  // 2-decimal precision matches Finviz / TradingView display convention.
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2)
}

// ── MACD (12/26/9, intraday-aware) ────────────────────────────────────────────
export function calcMACD(candles, currentPrice = null) {
  const closes = effectiveCloses(candles, currentPrice)
  if (closes.length < 26) return null
  const macdPoints = []
  for (let i = 25; i < closes.length; i++) {
    macdPoints.push(ema(closes.slice(0, i + 1), 12) - ema(closes.slice(0, i + 1), 26))
  }
  const signal = macdPoints.length >= 9 ? ema(macdPoints, 9) : macdPoints.at(-1)
  const value  = macdPoints.at(-1)
  return { value: +value.toFixed(3), signal: +signal.toFixed(3), bullish: value > signal }
}

// ── SMA ───────────────────────────────────────────────────────────────────────
export function calcSMA(candles, period, currentPrice = null) {
  const closes = effectiveCloses(candles, currentPrice)
  if (closes.length < period) return null
  return +(closes.slice(-period).reduce((s, c) => s + c, 0) / period).toFixed(2)
}

// ── Bollinger Bands (20-period, intraday-aware) ───────────────────────────────
export function calcBBPosition(candles, period = 20, currentPrice = null) {
  const closes = effectiveCloses(candles, currentPrice)
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  const mean  = slice.reduce((a, b) => a + b, 0) / period
  const std   = Math.sqrt(slice.reduce((s, c) => s + (c - mean) ** 2, 0) / period)
  const upper = mean + 2 * std
  const lower = mean - 2 * std
  const price = closes[closes.length - 1]
  const pct   = +((price - lower) / (upper - lower) * 100).toFixed(0)
  return { upper: +upper.toFixed(2), lower: +lower.toFixed(2), pct, price }
}

// ── Volume signal ─────────────────────────────────────────────────────────────
export function calcVolumeSignal(candles, period = 20) {
  if (candles.length < 2) return null
  const slice  = candles.slice(-(period + 1))
  const avgVol = slice.slice(0, -1).reduce((s, c) => s + c.volume, 0) / (slice.length - 1)
  const lastV  = candles.at(-1).volume
  return { ratio: +(lastV / avgVol).toFixed(2), above: lastV > avgVol, lastV, avgVol }
}

// ── VWAP (volume-weighted average price) ─────────────────────────────────────
// Classic intraday formula approximated on the daily series:
//   VWAP = Σ (typical_price * volume) / Σ volume
// where typical_price = (high + low + close) / 3.
// We compute over the trailing N candles for a recent, comparable benchmark.
export function calcVWAP(candles, period = 20) {
  if (!candles?.length) return null
  const slice = candles.slice(-Math.min(period, candles.length))
  let num = 0, den = 0
  for (const c of slice) {
    if (c.volume == null) continue
    const tp = (c.high + c.low + c.close) / 3
    num += tp * c.volume
    den += c.volume
  }
  if (den === 0) return null
  return +(num / den).toFixed(2)
}

// ── Support & Resistance ──────────────────────────────────────────────────────
export function calcSR(candles, currentPrice) {
  const resistance = [], support = []
  for (let i = 2; i < candles.length - 2; i++) {
    const { high: h, low: l } = candles[i]
    const isHighPivot = h > candles[i-1].high && h > candles[i-2].high
                     && h > candles[i+1].high && h > candles[i+2].high
    const isLowPivot  = l < candles[i-1].low  && l < candles[i-2].low
                     && l < candles[i+1].low  && l < candles[i+2].low
    if (isHighPivot && h > currentPrice) resistance.push(+h.toFixed(2))
    if (isLowPivot  && l < currentPrice) support.push(+l.toFixed(2))
  }
  // Also add 52W high/low proxies from the candle set as anchors
  const allHighs = candles.map(c => c.high)
  const allLows  = candles.map(c => c.low)
  const maxH = +Math.max(...allHighs).toFixed(2)
  const minL = +Math.min(...allLows).toFixed(2)
  if (maxH > currentPrice && !resistance.includes(maxH)) resistance.push(maxH)
  if (minL < currentPrice && !support.includes(minL))    support.push(minL)

  return {
    resistance: [...new Set(resistance)].sort((a, b) => a - b).slice(0, 3),
    support:    [...new Set(support)].sort((a, b) => b - a).slice(0, 3),
  }
}
