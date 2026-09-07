// Shared server-side authentication helpers.
//
// Lives in /lib (outside /api) so it doesn't count toward Vercel's serverless
// function quota. This is the single trust boundary for every authenticated
// API route — the secure pattern was first proven in api/stripe.js and is
// consolidated here so no endpoint re-implements (and subtly weakens) it.
//
// Two guards:
//   requireUser(req, res)  — validates a Supabase JWT from the Authorization
//                            header, returns the authenticated user or null
//                            (after writing a 401). NEVER trusts a user id from
//                            the request body.
//   requireCron(req, res)  — validates `Authorization: Bearer <CRON_SECRET>`
//                            for scheduled/cron invocations. Presence of
//                            x-vercel-cron alone is NOT trusted.
//
// The service-role Supabase client bypasses RLS and must never reach the
// browser. It is created here, once, and reused.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Memoised service-role client. Returns null when env is missing so callers
// can degrade to a 500 rather than throw on import.
let _admin = null
export function getSupabaseAdmin() {
  if (_admin) return _admin
  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return null
  _admin = createClient(SUPABASE_URL, SUPABASE_SVC_KEY, { auth: { persistSession: false } })
  return _admin
}

// Extract a bearer token from the Authorization header, or null.
export function getBearerToken(req) {
  const auth = req.headers?.authorization ?? ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() || null : null
}

// ── requireUser ─────────────────────────────────────────────────────────────
// Validates the Supabase JWT server-side via the service-role client. On any
// failure (missing token, invalid/expired token, admin not configured) it
// writes a 401 and returns null so the caller can `if (!user) return`.
//
// `admin` is injectable purely to keep unit tests hermetic; production callers
// omit it and get the shared client.
export async function requireUser(req, res, admin = getSupabaseAdmin()) {
  if (!admin) {
    res.status(500).json({ error: 'Auth service not configured' })
    return null
  }
  const token = getBearerToken(req)
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  return data.user
}

// ── requireCron ─────────────────────────────────────────────────────────────
// The ONLY accepted cron credential is `Authorization: Bearer <CRON_SECRET>`.
// Vercel Cron automatically sends exactly this header when the CRON_SECRET env
// var is set, so scheduled jobs keep working with no vercel.json change. We do
// NOT trust the x-vercel-cron header (spoofable by any caller) and we do NOT
// accept a ?secret= query param (leaks into logs/referrers).
//
// Returns true when authorized; otherwise writes a 401 and returns false.
// Never logs the secret.
export function requireCron(req, res) {
  const secret = process.env.CRON_SECRET
  const auth   = req.headers?.authorization
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
