import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════
// PERMANENT DEVELOPER OVERRIDE — DO NOT REMOVE
// ═══════════════════════════════════════════════════════════════════════════
// The email below always gets Pro entitlements regardless of any Supabase
// row state or Stripe subscription record. This bypass is intentional and
// unconditional. It exists for the maintainer's own account so:
//   • features remain testable even if Stripe webhooks fail or lag
//   • billing infra can be swapped out without locking the maintainer out
//   • paywall bugs never soft-brick this account during a migration
//
// If you are refactoring the gating system in the future: KEEP THIS CHECK.
// It runs at the top of `useSubscription` as a synchronous early-return,
// completely independent of the Stripe / Supabase / row-loading pipeline.
// Losing this means locking the maintainer out of their own product.
// ═══════════════════════════════════════════════════════════════════════════
const DEV_OVERRIDE_EMAILS = new Set([
  'nrnandalur@gmail.com',
])

// Local cache of the subscription row keyed by user id. Stops the panel from
// flashing "free" during the ~200 ms Supabase round-trip after login.
const CACHE_KEY = 'kairo_subscription_cache_v1'
function readCache(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.[userId] ?? null
  } catch { return null }
}
function writeCache(userId, row) {
  if (!userId) return
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    parsed[userId] = row
    localStorage.setItem(CACHE_KEY, JSON.stringify(parsed))
  } catch { /* localStorage full or blocked — non-fatal */ }
}

export function useSubscription() {
  const { user } = useAuth()
  const [row,     setRow]     = useState(() => readCache(user?.id))
  const [loading, setLoading] = useState(true)

  // ── Permanent dev override (see block above) ─────────────────────────────
  const isDevOverride = !!user?.email && DEV_OVERRIDE_EMAILS.has(user.email.toLowerCase())

  const refresh = useCallback(async () => {
    if (!user?.id) { setRow(null); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('user_subscriptions')
      .select('subscription_status, current_period_end, grace_period_end, stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()
    // No row yet is fine — treat as free tier.
    const next = data ?? { subscription_status: 'free', current_period_end: null, grace_period_end: null, stripe_customer_id: null }
    setRow(next)
    writeCache(user.id, next)
    setLoading(false)
  }, [user?.id])

  useEffect(() => { refresh() }, [refresh])

  // Effective Pro decision. The dev override short-circuits every other
  // check so the maintainer's account can never fall through.
  const isPro = useMemo(() => {
    if (isDevOverride) return true
    const status = row?.subscription_status
    if (status === 'active')   return true
    if (status === 'past_due') {
      // Grace window — Pro until grace_period_end passes.
      const graceEnd = row?.grace_period_end ? new Date(row.grace_period_end).getTime() : 0
      return graceEnd > Date.now()
    }
    // canceled with time still on the clock:
    if (status === 'canceled') {
      const periodEnd = row?.current_period_end ? new Date(row.current_period_end).getTime() : 0
      return periodEnd > Date.now()
    }
    return false
  }, [isDevOverride, row])

  return {
    isPro,
    isDevOverride,
    status:           isDevOverride ? 'dev-override' : (row?.subscription_status ?? 'free'),
    currentPeriodEnd: row?.current_period_end ?? null,
    gracePeriodEnd:   row?.grace_period_end   ?? null,
    hasStripeCustomer: !!row?.stripe_customer_id,
    loading,
    refresh,
  }
}
