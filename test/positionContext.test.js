import { describe, it, expect } from 'vitest'
import { buildPositionContext } from '../src/utils/positionContext.js'

const bullishDecision = {
  verdict: 'BUY', verdictLabel: 'Buy', direction: 'bullish',
  risk: { level: 'MODERATE' }, healthScore: 72,
  narrative: { whatWouldChange: { moreBullishIf: ['Price reclaims $110'], moreBearishIf: ['Price loses $95'] } },
}
const bearishDecision = {
  verdict: 'SELL', verdictLabel: 'Sell', direction: 'bearish',
  risk: { level: 'ELEVATED' }, healthScore: 28,
  narrative: { whatWouldChange: { moreBullishIf: ['Price reclaims $110'], moreBearishIf: ['Price loses $95'] } },
}

const joined = (ctx) => [ctx.contextText, ctx.positionRisk, ...(ctx.steps || [])].filter(Boolean).join(' ').toLowerCase()

describe('CASE 4 — large unrealized PROFIT but bullish setup', () => {
  const ctx = buildPositionContext({
    decision: bullishDecision,
    position: { gainPct: 35, gainDollars: 3500, breakeven: 74, price: 100 },
  })
  it('does NOT recommend selling/trimming just because profitable', () => {
    // Check the actionable STEPS carry no profit-driven sell recommendation.
    const stepsText = ctx.steps.join(' ').toLowerCase()
    expect(stepsText).not.toMatch(/take (partial )?profits|trim|sell now|reduce exposure|lock in the gain by selling/)
    // A protective trailing stop is allowed; an outright "exit"/"sell" imperative is not.
    expect(stepsText).not.toMatch(/\bsell\b|exit the position|close the position/)
  })
  it('keeps the bullish verdict unchanged (P/L does not drive it)', () => {
    expect(ctx.verdict).toBe('BUY')
    expect(ctx.direction).toBe('bullish')
  })
  it('frames the gain as risk management, not a signal', () => {
    expect(ctx.contextText.toLowerCase()).toMatch(/not a reason on its own to sell/)
  })
})

describe('CASE 5 — large unrealized LOSS and deteriorating setup', () => {
  const ctx = buildPositionContext({
    decision: bearishDecision,
    position: { gainPct: -22, gainDollars: -2200, breakeven: 128, price: 100 },
  })
  it('does NOT recommend HOLD just to avoid realizing the loss', () => {
    const text = joined(ctx)
    expect(text).toMatch(/stop level|act on it|decide a stop/)
    expect(text).not.toMatch(/hold (purely )?to avoid realizing the loss(?!)/)
    // It must not tell the user to simply hold.
    expect(ctx.steps.some(s => /hold on to|just hold|keep holding/i.test(s))).toBe(false)
  })
  it('keeps the bearish verdict unchanged', () => {
    expect(ctx.verdict).toBe('SELL')
    expect(ctx.direction).toBe('bearish')
  })
  it('frames the loss as risk management, not a hold signal', () => {
    expect(ctx.contextText.toLowerCase()).toMatch(/not a reason on its own to hold/)
  })
})

describe('no position → market-level guidance only', () => {
  it('returns steps without position context', () => {
    const ctx = buildPositionContext({ decision: bullishDecision })
    expect(ctx.contextText).toBeNull()
    expect(ctx.steps.length).toBeGreaterThan(0)
    expect(ctx.verdict).toBe('BUY')
  })
})
