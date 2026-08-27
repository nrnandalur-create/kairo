import { describe, it, expect, vi, beforeEach } from 'vitest'
import { requireUser, requireCron, getBearerToken } from '../lib/auth.js'
import { makeReq, makeRes } from './helpers.js'

const fakeAdmin = (user, error = null) => ({
  auth: { getUser: vi.fn(async () => ({ data: { user }, error })) },
})

describe('getBearerToken', () => {
  it('extracts the token', () => {
    expect(getBearerToken({ headers: { authorization: 'Bearer abc' } })).toBe('abc')
  })
  it('null without a Bearer header', () => {
    expect(getBearerToken({ headers: {} })).toBeNull()
    expect(getBearerToken({ headers: { authorization: 'Basic abc' } })).toBeNull()
  })
})

describe('requireUser', () => {
  it('no JWT -> 401, returns null', async () => {
    const res = makeRes()
    const user = await requireUser(makeReq({ headers: {} }), res, fakeAdmin({ id: 'u1' }))
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('invalid JWT -> 401, returns null', async () => {
    const res = makeRes()
    const admin = fakeAdmin(null, { message: 'invalid token' })
    const user = await requireUser(makeReq({ headers: { authorization: 'Bearer bad' } }), res, admin)
    expect(user).toBeNull()
    expect(res.statusCode).toBe(401)
  })

  it('valid JWT -> returns the authenticated user', async () => {
    const res = makeRes()
    const admin = fakeAdmin({ id: 'u1', email: 'a@b.com' })
    const user = await requireUser(makeReq({ headers: { authorization: 'Bearer good' } }), res, admin)
    expect(user).toEqual({ id: 'u1', email: 'a@b.com' })
    expect(res.statusCode).toBe(200) // untouched
    expect(admin.auth.getUser).toHaveBeenCalledWith('good')
  })
})

describe('requireCron', () => {
  beforeEach(() => { process.env.CRON_SECRET = 'secret123' })

  it('missing authorization -> 401', () => {
    const res = makeRes()
    expect(requireCron(makeReq({ headers: {} }), res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('incorrect CRON_SECRET -> 401', () => {
    const res = makeRes()
    expect(requireCron(makeReq({ headers: { authorization: 'Bearer wrong' } }), res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('does NOT accept a spoofed x-vercel-cron header alone', () => {
    const res = makeRes()
    expect(requireCron(makeReq({ headers: { 'x-vercel-cron': '1' } }), res)).toBe(false)
    expect(res.statusCode).toBe(401)
  })

  it('correct Bearer CRON_SECRET -> accepted', () => {
    const res = makeRes()
    expect(requireCron(makeReq({ headers: { authorization: 'Bearer secret123' } }), res)).toBe(true)
    expect(res.statusCode).toBe(200)
  })
})
