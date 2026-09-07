import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeReq, makeRes } from './helpers.js'

// Mock the three security modules so we drive auth / entitlement / quota
// outcomes precisely and assert the AI provider is only reached when allowed.
vi.mock('../lib/auth.js', () => ({
  getSupabaseAdmin: vi.fn(() => ({})),
  requireUser: vi.fn(),
}))
vi.mock('../lib/entitlements.js', () => ({ getEntitlement: vi.fn() }))
vi.mock('../lib/quota.js', () => ({ consumeAnalyzeQuota: vi.fn() }))

import handler from '../api/analyze.js'
import { requireUser } from '../lib/auth.js'
import { getEntitlement } from '../lib/entitlements.js'
import { consumeAnalyzeQuota } from '../lib/quota.js'

const validVerdictBody = (extra = {}) => ({
  ticker: 'AAPL',
  quote: { c: 150, dp: 1.2 },
  recentCandles: [{ time: 1, close: 150, volume: 1_000_000 }],
  indicators: { rsi: 55, macd: { bullish: true, value: 1, signal: 0.5 }, bb: { pct: 50, lower: 1, upper: 2 } },
  ...extra,
})

const groqOk = (content) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) })

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe('/api/analyze — auth + entitlement + quota ordering', () => {
  it('no JWT -> 401 and the AI provider is NEVER called', async () => {
    requireUser.mockImplementation(async (_req, res) => { res.status(401).json({ error: 'Not authenticated' }); return null })
    const res = makeRes()
    await handler(makeReq({ body: validVerdictBody() }), res)
    expect(res.statusCode).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('free user over quota -> 429 quota_exceeded and the AI provider is NEVER called', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'x@y.com' })
    getEntitlement.mockResolvedValue({ isPro: false })
    consumeAnalyzeQuota.mockResolvedValue({ allowed: false, quota: 'verdict', limit: 1, remaining: 0 })
    const res = makeRes()
    await handler(makeReq({ body: validVerdictBody() }), res)
    expect(res.statusCode).toBe(429)
    expect(res.body).toMatchObject({ error: 'quota_exceeded', quota: 'verdict', limit: 1, remaining: 0 })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('body { isPro: true } cannot fake Pro — quota still enforced', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'x@y.com' })
    getEntitlement.mockResolvedValue({ isPro: false }) // server truth ignores the body
    consumeAnalyzeQuota.mockResolvedValue({ allowed: false, quota: 'verdict', limit: 1, remaining: 0 })
    const res = makeRes()
    await handler(makeReq({ body: validVerdictBody({ isPro: true }) }), res)
    expect(res.statusCode).toBe(429)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('free user under quota -> verdict consumed and the AI provider is called', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'x@y.com' })
    getEntitlement.mockResolvedValue({ isPro: false })
    consumeAnalyzeQuota.mockResolvedValue({ allowed: true, quota: 'verdict', limit: 1, remaining: 0 })
    global.fetch.mockResolvedValue(groqOk('{"verdict":"BUY","confidence":80,"riskLevel":"LOW","entryPrice":150,"stopLoss":140,"summary":"ok"}'))
    const res = makeRes()
    await handler(makeReq({ body: validVerdictBody() }), res)
    expect(consumeAnalyzeQuota).toHaveBeenCalledWith(expect.anything(), 'u1', 'verdict', 'AAPL')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(res.body.verdict).toBe('BUY')
  })

  it('Pro user bypasses quota entirely and reaches the AI provider', async () => {
    requireUser.mockResolvedValue({ id: 'u1', email: 'pro@y.com' })
    getEntitlement.mockResolvedValue({ isPro: true })
    global.fetch.mockResolvedValue(groqOk('{"verdict":"SELL","confidence":75,"riskLevel":"HIGH","entryPrice":150,"stopLoss":160,"summary":"ok"}'))
    const res = makeRes()
    await handler(makeReq({ body: validVerdictBody() }), res)
    expect(consumeAnalyzeQuota).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(res.body.verdict).toBe('SELL')
  })

  it('compare mode is auth-gated too (401 before any provider call)', async () => {
    requireUser.mockImplementation(async (_req, res) => { res.status(401).json({ error: 'Not authenticated' }); return null })
    const res = makeRes()
    await handler(makeReq({ body: { type: 'compare', tickers: [{ ticker: 'AAPL' }, { ticker: 'MSFT' }] } }), res)
    expect(res.statusCode).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
