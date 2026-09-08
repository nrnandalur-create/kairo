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

describe('WHY is explainable — references top contributors + confidence (§1)', () => {
  const d = buildDecision({
    ...base, price: 112, sma50: 105, sma200: 98,
    macd: { value: 0.9, signal: 0.3, bullish: true },
    rsi: 71, bb: { upper: 110, lower: 100, pct: 120, price: 112 },
    volume: { ratio: 1.6, above: true }, priceChange5d: 6,
  })
  it('names the confidence number in the WHY', () => {
    expect(d.narrative.why).toContain(`${d.confidence}% confidence`)
  })
  it('mentions the strongest bullish AND the offsetting bearish evidence', () => {
    // Bullish trend/MACD + bearish Bollinger overextension should both surface.
    expect(d.narrative.why.toLowerCase()).toMatch(/macd|trend|momentum/)
    expect(d.narrative.why.toLowerCase()).toMatch(/bollinger|overbought|overextension/)
  })
})

describe('confidence tracks agreement (§2)', () => {
  it('strong one-sided agreement earns high confidence (80+)', () => {
    const d = buildDecision({
      ...base, price: 120, sma50: 110, sma200: 100,
      macd: { value: 1.4, signal: 0.3, bullish: true },
      rsi: 60, bb: { upper: 124, lower: 112, pct: 66, price: 120 },
      volume: { ratio: 1.8, above: true }, priceChange5d: 7,
    })
    expect(d.direction).toBe('bullish')
    expect(d.confidence).toBeGreaterThanOrEqual(80)
  })
  it('a conflicted setup cannot earn 80%+ confidence', () => {
    const d = buildDecision({
      ...base, price: 106, sma50: 104, sma200: 104,
      macd: { value: 0.5, signal: 0.2, bullish: true }, // bullish
      rsi: 74, bb: { upper: 104, lower: 96, pct: 130, price: 106 }, // bearish overextension
      priceChange5d: 2,
    })
    expect(d.confidence).toBeLessThan(80)
  })
})

describe('technical levels carry a source (§3, §4)', () => {
  const d = buildDecision({
    ...base, price: 100,
    sma50: 96, sma200: 90,
    macd: { value: 0.6, signal: 0.2, bullish: true },
    support: [{ price: 96.0, type: 'support', source: '50-day SMA' }],
    resistance: [{ price: 108.0, type: 'resistance', source: 'a recent swing high' }],
  })
  it('what-would-change conditions are arrays tied to signals/levels', () => {
    expect(Array.isArray(d.narrative.whatWouldChange.moreBearishIf)).toBe(true)
    const joined = d.narrative.whatWouldChange.moreBearishIf.join(' ')
    expect(joined).toMatch(/50-day SMA near \$96\.00/)      // uses the labeled source + price
    expect(joined.toLowerCase()).toMatch(/macd|trend/)      // monitorable signal conditions
  })
  it('never emits a bare unexplained price with no source', () => {
    for (const c of [...d.narrative.whatWouldChange.moreBullishIf, ...d.narrative.whatWouldChange.moreBearishIf]) {
      if (/\$\d/.test(c)) expect(c.toLowerCase()).toMatch(/sma|swing|support|resistance|level|band/)
    }
  })
})

describe('extreme Bollinger reading meaningfully raises risk (§6)', () => {
  it('11% above the upper band produces more risk than a marginal break', () => {
    const mild = buildDecision({ ...base, price: 100.5, bb: { upper: 100, lower: 92, pct: 105, price: 100.5 } })
    const extreme = buildDecision({ ...base, price: 111, bb: { upper: 100, lower: 92, pct: 240, price: 111 } })
    expect(extreme.risk.score).toBeGreaterThan(mild.risk.score)
    expect(extreme.risk.reasons.join(' ')).toMatch(/significant short-term overextension/)
  })
})

describe('debug breakdown answers "why this verdict at this confidence" (§7/§8)', () => {
  it('exposes signed per-signal points + direction/risk/agreement/confidence/verdict', () => {
    const d = buildDecision({ ...base, sma50: 104, macd: { value: 0.6, signal: 0.2, bullish: true }, priceChange5d: 4 })
    expect(Array.isArray(d.debug.bullishEvidence)).toBe(true)
    expect(d.debug.bullishEvidence.every(e => e.points >= 0)).toBe(true)
    expect(d.debug.bearishEvidence.every(e => e.points <= 0)).toBe(true)
    expect(d.debug).toHaveProperty('netDirectionScore')
    expect(d.debug).toHaveProperty('riskScore')
    expect(d.debug).toHaveProperty('agreementScore')
    expect(d.debug.confidence).toBe(d.confidence)
    expect(d.debug.verdict).toBe(d.verdict)
  })
})

describe('debug output is exposed (spec §12)', () => {
  it('includes per-signal contributions, scores, weights, confidence breakdown', () => {
    const d = buildDecision(base)
    expect(d.debug.contributions.length).toBeGreaterThan(0)
    expect(d.debug.weights).toBeTruthy()
    expect(d.debug.scores).toHaveProperty('net')
    expect(d.debug.confidenceInputs).toHaveProperty('agreement')
  })
})
