import { describe, it, expect, vi } from 'vitest'
import { applyQuotaDecision, consumeAnalyzeQuota } from '../lib/quota.js'

const empty = () => ({ searchedTickers: [], verdictCount: 0 })

describe('applyQuotaDecision — free-tier rules (mirror of the SQL RPC)', () => {
  it('first verdict of the day is allowed', () => {
    const r = applyQuotaDecision(empty(), 'verdict', 'AAPL')
    expect(r.allowed).toBe(true)
    expect(r.state.verdictCount).toBe(1)
  })

  it('second verdict on the same UTC day is denied', () => {
    const r = applyQuotaDecision({ searchedTickers: ['AAPL'], verdictCount: 1 }, 'verdict', 'AAPL')
    expect(r.allowed).toBe(false)
    expect(r.quota).toBe('verdict')
  })

  it('the same ticker searched repeatedly counts only once', () => {
    let s = empty()
    for (let i = 0; i < 4; i++) s = applyQuotaDecision(s, 'analysis', 'AAPL').state
    expect(s.searchedTickers).toEqual(['AAPL'])
  })

  it('5 unique tickers are allowed; the 6th is denied', () => {
    let s = empty()
    for (const t of ['A', 'B', 'C', 'D', 'E']) {
      const r = applyQuotaDecision(s, 'analysis', t)
      expect(r.allowed).toBe(true)
      s = r.state
    }
    const sixth = applyQuotaDecision(s, 'analysis', 'F')
    expect(sixth.allowed).toBe(false)
    expect(sixth.quota).toBe('search')
  })

  it('an already-counted ticker is still allowed even at the cap', () => {
    const s = { searchedTickers: ['A', 'B', 'C', 'D', 'E'], verdictCount: 0 }
    expect(applyQuotaDecision(s, 'analysis', 'A').allowed).toBe(true)
  })

  it('verdict is denied on a NEW ticker once the search cap is hit', () => {
    const s = { searchedTickers: ['A', 'B', 'C', 'D', 'E'], verdictCount: 0 }
    const r = applyQuotaDecision(s, 'verdict', 'F')
    expect(r.allowed).toBe(false)
    expect(r.quota).toBe('search')
  })

  it('followup / compare consume a verdict unit', () => {
    expect(applyQuotaDecision(empty(), 'followup', null).allowed).toBe(true)
    expect(applyQuotaDecision({ searchedTickers: [], verdictCount: 1 }, 'compare', null).allowed).toBe(false)
  })

  it('unknown mode fails closed', () => {
    expect(applyQuotaDecision(empty(), 'bogus', 'A').allowed).toBe(false)
  })
})

describe('consumeAnalyzeQuota — atomic RPC wiring', () => {
  it('calls consume_analyze_quota with the UTC date and returns its verdict', async () => {
    const admin = { rpc: vi.fn(async () => ({ data: { allowed: true, quota: 'verdict', limit: 1, remaining: 0 }, error: null })) }
    const r = await consumeAnalyzeQuota(admin, 'u1', 'verdict', 'AAPL', new Date('2026-08-24T10:00:00Z'))
    expect(admin.rpc).toHaveBeenCalledWith('consume_analyze_quota', {
      p_user: 'u1', p_date: '2026-08-24', p_mode: 'verdict', p_ticker: 'AAPL',
    })
    expect(r).toEqual({ allowed: true, quota: 'verdict', limit: 1, remaining: 0 })
  })

  it('models the atomic guard: two simultaneous verdicts, only one passes', async () => {
    // The real atomicity lives in Postgres (SELECT ... FOR UPDATE). Here we
    // model it by serialising the shared row through applyQuotaDecision, which
    // encodes the same rules, to prove the caller can't double-consume.
    let row = { searchedTickers: [], verdictCount: 0 }
    const admin = {
      rpc: vi.fn(async (_fn, args) => {
        const d = applyQuotaDecision(row, args.p_mode, args.p_ticker)
        row = d.state
        return { data: { allowed: d.allowed, quota: d.quota, limit: d.limit, remaining: d.remaining }, error: null }
      }),
    }
    const results = await Promise.all([
      consumeAnalyzeQuota(admin, 'u1', 'verdict', 'AAPL'),
      consumeAnalyzeQuota(admin, 'u1', 'verdict', 'AAPL'),
    ])
    expect(results.filter(r => r.allowed).length).toBe(1)
  })
})
