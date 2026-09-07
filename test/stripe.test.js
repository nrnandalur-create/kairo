import { describe, it, expect, vi } from 'vitest'
import { makeReq, makeRes } from './helpers.js'

// Mock the Supabase client so the shared getSupabaseAdmin() (used by the
// refactored stripe endpoint) builds a client whose getUser rejects unknown
// tokens — enough to prove auth is still enforced after consolidating onto
// lib/auth. Stripe SDK itself is never constructed (no STRIPE_SECRET_KEY set).
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no session' } })) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

import handler from '../api/stripe.js'

describe('/api/stripe still enforces auth after the shared-helper refactor', () => {
  it('GET ?action=status without a token -> 401', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET', headers: {}, query: { action: 'status' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('non-POST for a write action -> 405 (routing preserved)', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET', headers: {}, query: { action: 'checkout' } }), res)
    expect(res.statusCode).toBe(405)
  })
})
