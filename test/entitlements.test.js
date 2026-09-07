import { describe, it, expect } from 'vitest'
import { decideEntitlement, getEntitlement } from '../lib/entitlements.js'

const NOW    = Date.parse('2026-08-24T00:00:00Z')
const future = new Date(NOW + 86_400_000).toISOString()
const past   = new Date(NOW - 86_400_000).toISOString()

describe('decideEntitlement (server-authoritative Pro logic)', () => {
  it('active -> Pro', () => {
    expect(decideEntitlement({ subscription_status: 'active' }, 'x@y.com', NOW).isPro).toBe(true)
  })
  it('past_due within grace window -> Pro', () => {
    expect(decideEntitlement({ subscription_status: 'past_due', grace_period_end: future }, 'x@y.com', NOW).isPro).toBe(true)
  })
  it('past_due after grace window -> Free', () => {
    expect(decideEntitlement({ subscription_status: 'past_due', grace_period_end: past }, 'x@y.com', NOW).isPro).toBe(false)
  })
  it('canceled but still in paid period -> Pro', () => {
    expect(decideEntitlement({ subscription_status: 'canceled', current_period_end: future }, 'x@y.com', NOW).isPro).toBe(true)
  })
  it('canceled after period end -> Free', () => {
    expect(decideEntitlement({ subscription_status: 'canceled', current_period_end: past }, 'x@y.com', NOW).isPro).toBe(false)
  })
  it('free -> Free', () => {
    expect(decideEntitlement({ subscription_status: 'free' }, 'x@y.com', NOW).isPro).toBe(false)
  })
  it('null row -> Free', () => {
    expect(decideEntitlement(null, 'x@y.com', NOW).isPro).toBe(false)
  })
  it('maintainer dev-override email -> Pro regardless of row', () => {
    expect(decideEntitlement({ subscription_status: 'free' }, 'nrnandalur@gmail.com', NOW).isPro).toBe(true)
  })
})

describe('getEntitlement (reads DB by authed user id; ignores client)', () => {
  const adminReturning = (row) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }),
  })

  it('uses the DB row, not any client-supplied isPro', async () => {
    const ent = await getEntitlement({ id: 'u1', email: 'x@y.com' }, adminReturning({ subscription_status: 'free' }))
    expect(ent.isPro).toBe(false)
  })

  it('resolves Pro from an active row', async () => {
    const ent = await getEntitlement({ id: 'u1', email: 'x@y.com' }, adminReturning({ subscription_status: 'active' }))
    expect(ent.isPro).toBe(true)
  })
})
