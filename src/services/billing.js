import { supabase } from '../lib/supabase'

// Client-side helpers for the Stripe billing endpoint. Every call carries the
// user's Supabase JWT so the server can attribute the request. The server's
// endpoint short-circuits to 401 without it.
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

// Kick off a Stripe Checkout session. `interval` is 'monthly' or 'annual'.
// Redirects the browser to Stripe on success — never returns to the caller.
export async function startCheckout(interval) {
  const headers = await authHeaders()
  const r = await fetch('/api/stripe?action=checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify({ interval }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error ?? `Checkout failed (${r.status})`)
  }
  const { url } = await r.json()
  if (!url) throw new Error('Checkout URL missing from response')
  window.location.assign(url)
}

// Open the Stripe Customer Portal for subscription management. Server returns
// a one-time URL that Stripe hosts — we redirect there.
export async function openBillingPortal() {
  const headers = await authHeaders()
  const r = await fetch('/api/stripe?action=portal', { method: 'POST', headers })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error ?? `Portal request failed (${r.status})`)
  }
  const { url } = await r.json()
  if (!url) throw new Error('Portal URL missing from response')
  window.location.assign(url)
}

// Query the current user's subscription row from the server. useSubscription
// reads directly from Supabase with RLS, so this endpoint is a fallback for
// cases where the client hook is unavailable (e.g., a background job).
export async function fetchSubscriptionStatus() {
  const headers = await authHeaders()
  const r = await fetch('/api/stripe?action=status', { method: 'GET', headers })
  if (!r.ok) throw new Error(`Status fetch failed (${r.status})`)
  return r.json()
}
