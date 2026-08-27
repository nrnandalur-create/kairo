import { describe, it, expect, beforeEach } from 'vitest'
import handler from '../api/cron.js'
import { makeReq, makeRes } from './helpers.js'

// api/cron.js is the single authorization boundary for every job. We only need
// to prove the Bearer CRON_SECRET gate — jobs themselves are not executed
// because auth fails, or because we route to an unknown job after auth passes.
beforeEach(() => { process.env.CRON_SECRET = 'cron-xyz' })

describe('/api/cron authorization', () => {
  it('missing authorization -> 401', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: {}, query: { job: 'open-brief' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('incorrect CRON_SECRET -> 401', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer wrong' }, query: { job: 'open-brief' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('spoofed x-vercel-cron header alone -> 401', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: { 'x-vercel-cron': '1' }, query: { job: 'open-brief' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('correct Bearer CRON_SECRET is accepted (reaches job routing)', async () => {
    const res = makeRes()
    // Unknown job name proves we got PAST auth into the dispatcher (400, not 401).
    await handler(makeReq({ headers: { authorization: 'Bearer cron-xyz' }, query: { job: '__nope__' } }), res)
    expect(res.statusCode).toBe(400)
    expect(String(res.body?.error)).toMatch(/Unknown or missing job/)
  })
})
