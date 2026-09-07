// Server-side entitlement resolution — the authoritative Free vs Pro decision.
//
// The browser hook src/hooks/useSubscription.js computes `isPro` for UI
// purposes, but that value can be forged. Any endpoint that gates on Pro MUST
// call getEntitlement() with the AUTHENTICATED user (from lib/auth.requireUser)
// and read the row itself. Client-supplied values (isPro, subscriptionStatus,
// userId, remaining quota) are never trusted.
//
// The Pro logic mirrors useSubscription exactly so client and server agree:
//   active                          -> Pro
//   past_due  & grace_period_end>now-> Pro   (grace window after failed payment)
//   canceled  & current_period_end>now -> Pro (paid through end of period)
//   free / anything else            -> Free
//
// Plus the permanent maintainer dev-override (same intent as the client's
// DEV_OVERRIDE_EMAILS), configurable via env so the maintainer account is not
// quota-limited or paywalled server-side either.

import { getSupabaseAdmin } from './auth.js'

// Maintainer override emails. Defaults to the known maintainer address to
// preserve existing behavior; override/extend via DEV_OVERRIDE_EMAILS
// (comma-separated) without a code change.
const DEV_OVERRIDE_EMAILS = new Set(
  (process.env.DEV_OVERRIDE_EMAILS ?? 'nrnandalur@gmail.com')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
)

// Decide Pro from a subscription row + email. Pure and deterministic given
// `now` (injectable for tests). Never reads request input.
export function decideEntitlement(row, email, now = Date.now()) {
  if (email && DEV_OVERRIDE_EMAILS.has(email.toLowerCase())) {
    return { isPro: true, status: 'dev-override', reason: 'dev-override' }
  }
  const status = row?.subscription_status ?? 'free'
  if (status === 'active') {
    return { isPro: true, status, reason: 'active' }
  }
  if (status === 'past_due') {
    const graceEnd = row?.grace_period_end ? new Date(row.grace_period_end).getTime() : 0
    return { isPro: graceEnd > now, status, reason: graceEnd > now ? 'grace' : 'grace-expired' }
  }
  if (status === 'canceled') {
    const periodEnd = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0
    return { isPro: periodEnd > now, status, reason: periodEnd > now ? 'period-remaining' : 'period-ended' }
  }
  return { isPro: false, status: 'free', reason: 'free' }
}

// Fetch the authenticated user's subscription row (service-role, bypasses RLS)
// and resolve entitlement. `admin` is injectable for tests.
export async function getEntitlement(user, admin = getSupabaseAdmin()) {
  if (!user?.id) return { isPro: false, status: 'free', reason: 'no-user' }
  if (!admin)    return { isPro: false, status: 'free', reason: 'no-admin' }

  const { data: row } = await admin
    .from('user_subscriptions')
    .select('subscription_status, current_period_end, grace_period_end')
    .eq('user_id', user.id)
    .maybeSingle()

  return decideEntitlement(row, user.email)
}
