import { describe, it, expect } from 'vitest'
import { buildDecision, describeBollinger } from '../lib/decisionEngine.js'

// A well-populated large-cap-style baseline. bb carries only upper/lower (the
// engine derives position from the bands) so mocks are never self-inconsistent.
const base = {
  ticker: 'TEST', price: 100,
  rsi: 52,
  macd: { value: 0.1, signal: 0.1, bullish: false },
  bb: { upper: 106, lower: 94, price: 100 },
  sma20: 100, sma50: 100, sma200: 100,
  volume: { ratio: 1.0, above: false },
  priceChange5d: 0, atrPct: 2.0,
  hi52: 130, lo52: 80, beta: 1.1,
  pe: 25, epsGrowth5Y: 20,
  support: [{ price: 96, type: 'support', source: '50-day SMA' }],
  resistance: [{ price: 108, type: 'resistance', source: 'a recent swing high' }],
  historyLen: 400,
}
const mk = (o = {}) => buildDecision({ ...base, ...o })
const consistent = (d) => { expect(d.consistency.ok).toBe(true); return d }

describe('describeBollinger (spec §13 — no "111% of band")', () => {
  it('above the upper band reports a real % distance', () => {
    expect(describeBollinger({ upper: 100, lower: 90 }, 103.2).text).toMatch(/3\.2% above the upper Bollinger Band/)
  })
  it('inside the bands says so', () => expect(describeBollinger({ upper: 110, lower: 90 }, 100).zone).toBe('inside'))
})

describe('TEST 1 — strong trend + momentum + volume, normal vol → Bullish/Buy(+)', () => {
  const d = consistent(mk({
    price: 118, sma20: 112, sma50: 106, sma200: 98,
    macd: { value: 1.1, signal: 0.3, bullish: true }, rsi: 62,
    bb: { upper: 122, lower: 108, price: 118 }, volume: { ratio: 1.7, above: true },
    priceChange5d: 7, atrPct: 2.2,
  }))
  it('is bullish', () => { expect(d.direction).toBe('bullish'); expect(['BUY', 'STRONG_BUY']).toContain(d.verdict) })
  it('has healthy confidence + health', () => { expect(d.confidence).toBeGreaterThanOrEqual(70); expect(d.healthScore).toBeGreaterThanOrEqual(60) })
})

describe('TEST 2 — strong trend + RSI overbought + MACD bullish → NOT auto-sell', () => {
  const d = consistent(mk({
    price: 120, sma20: 113, sma50: 107, sma200: 99,
    macd: { value: 1.2, signal: 0.4, bullish: true }, rsi: 74,
    bb: { upper: 121, lower: 109, price: 120 }, volume: { ratio: 1.6, above: true }, priceChange5d: 8,
  }))
  it('stays bullish despite RSI 74 (momentum, not reversal)', () => expect(d.direction).toBe('bullish'))
})

describe('TEST 3 — weak trend + RSI oversold + MACD bearish → NOT auto-buy', () => {
  const d = consistent(mk({
    price: 84, sma20: 88, sma50: 94, sma200: 102,
    macd: { value: -0.9, signal: -0.2, bullish: false }, rsi: 26,
    bb: { upper: 100, lower: 78, price: 84 }, priceChange5d: -9, atrPct: 4.5,
  }))
  it('does not turn bullish just because RSI is oversold', () => expect(d.direction).not.toBe('bullish'))
})

describe('TEST 4 — bullish MACD + bearish trend + high vol + neutral RSI → mixed', () => {
  const d = consistent(mk({
    price: 95, sma20: 97, sma50: 101, sma200: 108,
    macd: { value: 0.4, signal: 0.1, bullish: true }, rsi: 50,
    bb: { upper: 112, lower: 78, price: 95 }, atrPct: 6.5, priceChange5d: -1,
  }))
  it('is not a high-confidence directional call', () => expect(d.confidence).toBeLessThan(72))
})

describe('TEST 5 & 6 — moving-average alignment drives the trend category', () => {
  it('price > SMA20 > SMA50 > SMA200 (all rising) → strongly positive trend score', () => {
    const d = mk({ price: 120, sma20: 114, sma50: 108, sma200: 100, rsi: 60, macd: { value: 0.8, signal: 0.3, bullish: true } })
    expect(d.categories.trend).toBeGreaterThan(45)
  })
  it('price < SMA20 < SMA50 < SMA200 → strongly negative trend score', () => {
    const d = mk({ price: 80, sma20: 86, sma50: 92, sma200: 100, rsi: 40, macd: { value: -0.8, signal: -0.3, bullish: false } })
    expect(d.categories.trend).toBeLessThan(-45)
  })
})

describe('TEST 7 — missing indicators are EXCLUDED, not zeroed/neutral (spec §27)', () => {
  const full = mk()
  const sparse = buildDecision({ ticker: 'T', price: 100, rsi: 58, macd: { value: 0.4, signal: 0.1, bullish: true }, bb: { upper: 106, lower: 94, price: 100 }, historyLen: 120 })
  it('still produces a verdict with only a few signals', () => expect(sparse.verdict).toBeTruthy())
  it('data completeness + confidence decline vs the full-data case', () => {
    expect(sparse.dataCompleteness).toBeLessThan(full.dataCompleteness)
    expect(sparse.confidence).toBeLessThanOrEqual(full.confidence + 1)
  })
  it('missing categories are null (excluded), not 0', () => {
    expect(sparse.categories.volume ?? null).toBeNull()
    expect(sparse.categories.trend ?? null).toBeNull()
  })
})

describe('TEST 8 — new IPO without SMA200 → no crash, SMA200 excluded', () => {
  const d = consistent(buildDecision({
    ticker: 'IPO', price: 50, rsi: 58, macd: { value: 0.5, signal: 0.2, bullish: true },
    bb: { upper: 54, lower: 46, price: 50 }, sma20: 48, sma50: 45, sma200: null,
    volume: { ratio: 1.4, above: true }, priceChange5d: 5, atrPct: 3.5, historyLen: 90,
  }))
  it('analyzes without SMA200 and does not treat it as bearish/neutral', () => {
    expect(d.signals.find(s => s.id === 'price_vs_sma200')).toBeUndefined()
    expect(d.direction).toBe('bullish')
  })
  it('completeness is below a full-history security', () => {
    expect(d.dataCompleteness).toBeLessThan(1)
  })
})

describe('TEST 9 — highly volatile bullish stock → bullish + High/Elevated risk', () => {
  const d = consistent(mk({
    price: 118, sma20: 110, sma50: 102, sma200: 92,
    macd: { value: 1.4, signal: 0.3, bullish: true }, rsi: 66,
    bb: { upper: 128, lower: 92, price: 118 }, volume: { ratio: 2.0, above: true }, priceChange5d: 14, atrPct: 8.0, beta: 2.2,
  }))
  it('direction bullish coexists with elevated+ risk', () => {
    expect(d.direction).toBe('bullish')
    expect(['ELEVATED', 'HIGH', 'EXTREME']).toContain(d.risk.level)
  })
})

describe('TEST 12 — above upper band on high-volume breakout in strong trend → momentum, not auto-sell', () => {
  const d = consistent(mk({
    price: 128, sma20: 118, sma50: 108, sma200: 96,
    macd: { value: 1.6, signal: 0.4, bullish: true }, rsi: 72,
    bb: { upper: 124, lower: 112, price: 128 }, volume: { ratio: 2.2, above: true }, priceChange5d: 12, atrPct: 4.2,
  }))
  it('recognizes momentum (still bullish) AND flags extension risk', () => {
    expect(d.direction).toBe('bullish')
    expect(['ELEVATED', 'HIGH', 'EXTREME']).toContain(d.risk.level)
  })
})

describe('TEST 13 — an unconfirmed (weak-volume) overextension carries more pullback risk (§13)', () => {
  // Identical price/extension/trend; the ONLY difference is volume confirmation
  // (and a weakening histogram), isolating the confirmation effect.
  const common = { price: 128, sma20: 120, sma50: 112, sma200: 100, rsi: 72, bb: { upper: 124, lower: 112, price: 128 }, priceChange5d: 6, atrPct: 3.0 }
  const confirmed   = mk({ ...common, macd: { value: 1.2, signal: 0.4, bullish: true }, volume: { ratio: 2.0, above: true } })
  const unconfirmed = mk({ ...common, macd: { value: 0.5, signal: 0.55, bullish: false, histPrev: 0.9 }, volume: { ratio: 0.7, above: false } })
  it('the weak-volume overextension is the riskier of the two', () => {
    expect(unconfirmed.risk.score).toBeGreaterThan(confirmed.risk.score)
  })
})

describe('TEST 14 — strong agreement but limited history → confidence reflects it', () => {
  const long  = mk({ price: 118, sma20: 112, sma50: 106, sma200: 98, macd: { value: 1.1, signal: 0.3, bullish: true }, rsi: 62, volume: { ratio: 1.7, above: true }, priceChange5d: 7, historyLen: 500 })
  const short = mk({ price: 118, sma20: 112, sma50: 106, sma200: null, macd: { value: 1.1, signal: 0.3, bullish: true }, rsi: 62, volume: { ratio: 1.7, above: true }, priceChange5d: 7, historyLen: 55 })
  it('both bullish, but limited history lowers confidence', () => {
    expect(short.direction).toBe('bullish')
    expect(short.confidence).toBeLessThan(long.confidence)
  })
})

describe('TEST 15 — inconsistent displayed vs derived inputs are caught (spec §29)', () => {
  it('flags a Bollinger position that disagrees with the bands', () => {
    const d = buildDecision({ ...base, bb: { upper: 104, lower: 96, price: 100, pct: 90 } }) // pct should be ~50
    expect(d.consistency.ok).toBe(false)
    expect(d.consistency.issues.join(' ')).toMatch(/Bollinger position mismatch/)
  })
})

describe('Strong ratings are RARE — require multi-category agreement (spec §23)', () => {
  it('a couple of common bullish signals do not produce STRONG_BUY', () => {
    const d = mk({ price: 103, sma20: 101, sma50: 101, sma200: 101, macd: { value: 0.3, signal: 0.2, bullish: true }, rsi: 55, volume: { ratio: 1.1, above: true }, priceChange5d: 2 })
    expect(d.verdict).not.toBe('STRONG_BUY')
  })
})

describe('direction / health / risk / confidence are FOUR different things (§5)', () => {
  it('a clean bearish setup: confident, but low health (poor to own)', () => {
    const d = mk({ price: 82, sma20: 88, sma50: 94, sma200: 103, macd: { value: -1.1, signal: -0.3, bullish: false }, rsi: 34, bb: { upper: 96, lower: 78, price: 82 }, priceChange5d: -9, atrPct: 3.5 })
    expect(d.direction).toBe('bearish')
    expect(d.healthScore).toBeLessThan(45)
    expect(d.healthScore).not.toBe(d.confidence)
  })
})

describe('confidence != probability; agreement bounds it (§2/§24)', () => {
  it('conflicted evidence cannot earn 80%+', () => {
    const d = mk({ price: 106, sma20: 105, sma50: 104, sma200: 104, macd: { value: 0.5, signal: 0.2, bullish: true }, rsi: 74, bb: { upper: 104, lower: 98, price: 106 }, volume: { ratio: 0.9 }, priceChange5d: 1 })
    expect(d.confidence).toBeLessThan(80)
  })
})

describe('WHY explains the verdict + confidence, no verdict words in evidence (§32/§34)', () => {
  const d = mk({ price: 116, sma20: 110, sma50: 105, sma200: 98, macd: { value: 0.9, signal: 0.3, bullish: true }, rsi: 63, volume: { ratio: 1.6, above: true }, priceChange5d: 6 })
  it('names the confidence and the scope', () => {
    expect(d.narrative.why).toContain(`${d.confidence}% confidence`)
    expect(d.narrative.why.toLowerCase()).toMatch(/technical|overall/)
  })
  it('signals use evidence language, never BUY/SELL', () => {
    for (const s of d.signals) expect(s.explanation).not.toMatch(/\b(BUY|SELL)\b/)
  })
  it('what-would-change conditions are level/signal-tied arrays', () => {
    expect(Array.isArray(d.narrative.whatWouldChange.moreBearishIf)).toBe(true)
    expect(d.narrative.whatWouldChange.moreBearishIf.join(' ').toLowerCase()).toMatch(/macd|sma|support|trend/)
  })
})

describe('debug object answers "why this rating at this confidence" (§35)', () => {
  const d = mk({ price: 116, sma20: 110, sma50: 105, sma200: 98, macd: { value: 0.9, signal: 0.3, bullish: true }, rsi: 63, volume: { ratio: 1.6, above: true }, priceChange5d: 6 })
  it('exposes category scores, signed evidence, and the confidence breakdown', () => {
    expect(d.debug.categories).toHaveProperty('trend')
    expect(d.debug.bullishEvidence.every(e => e.points >= 0)).toBe(true)
    expect(d.debug.bearishEvidence.every(e => e.points <= 0)).toBe(true)
    expect(d.debug).toHaveProperty('netDirectionScore')
    expect(d.debug).toHaveProperty('riskScore')
    expect(d.debug.confidence).toHaveProperty('signalAgreement')
    expect(d.debug.confidence).toHaveProperty('dataCompleteness')
    expect(d.debug.verdict.rating).toBe(d.verdict)
  })
})

describe('scope: technical vs overall (§19)', () => {
  it('is technical when no fundamentals are supplied', () => {
    const d = buildDecision({ ticker: 'T', price: 100, rsi: 55, macd: { value: 0.4, signal: 0.1, bullish: true }, bb: { upper: 106, lower: 94, price: 100 }, sma20: 99, sma50: 98, historyLen: 300 })
    expect(d.scope).toBe('technical')
  })
  it('is overall when valuation + growth are present', () => {
    expect(mk({ pe: 22, epsGrowth5Y: 25 }).scope).toBe('overall')
  })
})

describe('unavailable data is never a fabricated verdict', () => {
  it('returns unavailable when no core technicals', () => {
    const d = buildDecision({ ticker: 'X', price: 10, noTechnicals: true })
    expect(d.unavailable).toBe(true)
    expect(d.verdict).toBeUndefined()
  })
})
