import { describe, it, expect } from 'vitest'
import { buildDecision, describeBollinger } from '../lib/decisionEngine.js'

// Helper: a neutral-ish baseline we perturb per case.
const base = {
  ticker: 'TEST', price: 100,
  rsi: 52,
  macd: { value: 0.1, signal: 0.1, bullish: false },
  bb: { upper: 106, lower: 94, pct: 50, price: 100 },
  sma50: 100, sma200: 100,
  volume: { ratio: 1.0, above: false },
  priceChange5d: 0,
  hi52: 130, lo52: 80,
  support: [95], resistance: [108],
}

// No output may ever assert two directions at once.
function assertNoDualDirection(d) {
  // The verdict has exactly one direction, and no signal is expressed as a verdict.
  expect(['bullish', 'neutral', 'bearish']).toContain(d.direction)
  for (const s of d.signals) {
    expect(s.explanation).not.toMatch(/\b(BUY|SELL)\b/) // evidence language, not verdicts
  }
  expect(d.consistency.ok).toBe(true)
}

describe('describeBollinger (spec §7 — no "111% of band")', () => {
  it('above the upper band reports a real % distance', () => {
    const d = describeBollinger({ upper: 100, lower: 90 }, 103.2)
    expect(d.zone).toBe('above_upper')
    expect(d.text).toMatch(/3\.2% above the upper Bollinger Band/)
    expect(d.text).not.toMatch(/%.*of the band/)
  })
  it('inside the bands says so', () => {
    expect(describeBollinger({ upper: 110, lower: 90 }, 100).zone).toBe('inside')
  })
  it('below the lower band reports distance below', () => {
    expect(describeBollinger({ upper: 110, lower: 100 }, 96).zone).toBe('below_lower')
  })
})

describe('CASE 1 — bullish MACD + overextended Bollinger + neutral trend → mixed/HOLD', () => {
  const d = buildDecision({
    ...base,
    macd: { value: 0.6, signal: 0.2, bullish: true }, // bullish momentum
    bb: { upper: 104, lower: 96, pct: 130, price: 106 }, // price above upper band
    price: 106,
    rsi: 72,          // overextended
    sma50: 100, sma200: 100, // neutral trend
    priceChange5d: 1,
  })
  it('does not simultaneously output BUY and SELL', () => assertNoDualDirection(d))
  it('lands on HOLD (mixed evidence)', () => {
    expect(d.verdict).toBe('HOLD')
    expect(d.direction).toBe('neutral')
  })
  it('confidence reflects conflict (mid band, not "bad")', () => {
    expect(d.confidence).toBeGreaterThanOrEqual(42)
    expect(d.confidence).toBeLessThanOrEqual(62)
  })
  it('surfaces both bullish (MACD) and bearish (overextension) evidence', () => {
    const dirs = new Set(d.signals.map(s => s.direction))
    expect(dirs.has('bullish')).toBe(true)
    expect(dirs.has('bearish')).toBe(true)
  })
})

describe('CASE 2 — strong bearish trend + weak momentum + high volatility → bearish + elevated/high risk', () => {
  const d = buildDecision({
    ...base,
    price: 88,
    sma50: 95, sma200: 105,   // price < sma50 < sma200 → bearish structure
    macd: { value: -0.8, signal: -0.2, bullish: false },
    rsi: 38,
    bb: { upper: 102, lower: 74, pct: 50, price: 88 }, // wide bands (high volatility)
    priceChange5d: -12,
    lo52: 85,
  })
  it('is bearish', () => {
    expect(d.direction).toBe('bearish')
    expect(['REDUCE', 'SELL', 'STRONG_SELL']).toContain(d.verdict)
  })
  it('has elevated or higher risk', () => {
    expect(['ELEVATED', 'HIGH', 'EXTREME']).toContain(d.risk.level)
  })
  it('stays internally consistent', () => assertNoDualDirection(d))
})

describe('CASE 3 — strong bullish trend + healthy momentum + normal volatility → bullish', () => {
  const d = buildDecision({
    ...base,
    price: 112,
    sma50: 105, sma200: 98,   // price > sma50 > sma200 → bullish structure
    macd: { value: 0.9, signal: 0.3, bullish: true },
    rsi: 61,
    bb: { upper: 116, lower: 104, pct: 66, price: 112 }, // normal width, inside
    volume: { ratio: 1.6, above: true },
    priceChange5d: 6,
  })
  it('is bullish', () => {
    expect(d.direction).toBe('bullish')
    expect(['BUY', 'STRONG_BUY']).toContain(d.verdict)
  })
  it('has healthy confidence and health score', () => {
    expect(d.confidence).toBeGreaterThanOrEqual(60)
    expect(d.healthScore).toBeGreaterThanOrEqual(60)
  })
  it('stays internally consistent', () => assertNoDualDirection(d))
})

describe('confidence & health are DIFFERENT measures (spec §4, §5)', () => {
  it('a clean bearish setup has high confidence but LOW health', () => {
    const d = buildDecision({
      ...base, price: 85, sma50: 92, sma200: 100,
      macd: { value: -1.0, signal: -0.3, bullish: false },
      rsi: 34, priceChange5d: -9,
      bb: { upper: 98, lower: 80, pct: 30, price: 85 },
    })
    expect(d.direction).toBe('bearish')
    expect(d.confidence).toBeGreaterThanOrEqual(60)   // confident in the bearish read
    expect(d.healthScore).toBeLessThan(45)            // but a poor setup to own
    expect(d.healthScore).not.toBe(d.confidence)
  })
})

describe('overextension group is de-correlated (spec §8)', () => {
  it('RSI + Bollinger both overbought do not overwhelm a strong bullish trend', () => {
    const d = buildDecision({
      ...base,
      price: 120, sma50: 110, sma200: 100, // strong bullish trend
      macd: { value: 1.2, signal: 0.4, bullish: true },
      rsi: 74,                              // overbought
      bb: { upper: 118, lower: 108, pct: 130, price: 120 }, // above upper band
      priceChange5d: 8, volume: { ratio: 1.5, above: true },
    })
    // Trend + momentum should still win; overextension nudges risk up, not the verdict to SELL.
    expect(d.direction).toBe('bullish')
    // Overextension registers as RISK (above the low baseline), not as a bearish verdict.
    expect(['MODERATE', 'ELEVATED', 'HIGH', 'EXTREME']).toContain(d.risk.level)
    expect(d.risk.reasons.some(r => /Bollinger Band/i.test(r))).toBe(true)
  })
})

describe('unavailable data is never a fabricated verdict', () => {
  it('returns unavailable when no core technicals', () => {
    const d = buildDecision({ ticker: 'X', price: 10, noTechnicals: true })
    expect(d.unavailable).toBe(true)
    expect(d.verdict).toBeUndefined()
  })
})

describe('debug output is exposed (spec §12)', () => {
  it('includes per-signal contributions, scores, weights, confidence breakdown', () => {
    const d = buildDecision(base)
    expect(d.debug.contributions.length).toBeGreaterThan(0)
    expect(d.debug.weights).toBeTruthy()
    expect(d.debug.scores).toHaveProperty('net')
    expect(d.debug.confidence).toHaveProperty('agreement')
  })
})
