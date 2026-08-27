import { supabase } from './supabase'

// Client-side helper: attach the current Supabase access token to authenticated
// API requests. The server (lib/auth.requireUser) validates it and is the sole
// authority on identity, entitlement, and quota — the client just forwards the
// token and shows whatever the server decides.

// Current access token, or null when signed out.
export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// Merge an Authorization header onto `base` when signed in. Signed-out callers
// get `base` unchanged, so the request still goes out and the server returns a
// clean 401 the UI can surface.
export async function authHeaders(base = {}) {
  const token = await getAccessToken()
  return token ? { ...base, Authorization: `Bearer ${token}` } : { ...base }
}

// Turn a server auth/entitlement/quota response into a friendly, user-facing
// message. Keeps the messaging consistent across every AI surface. `body` is
// the parsed JSON error payload (may be empty).
export function describeApiError(status, body = {}) {
  if (status === 401) return 'Please sign in to use Kairo AI features.'
  if (status === 403 && body?.error === 'pro_required') {
    return 'This is a Kairo Pro feature — upgrade to unlock it.'
  }
  if (status === 429 && body?.error === 'quota_exceeded') {
    if (body.quota === 'verdict') {
      return "You've used your free AI verdict for today. Upgrade to Kairo Pro for unlimited AI analysis."
    }
    if (body.quota === 'search') {
      return "You've reached today's free limit of 5 tickers. Upgrade to Kairo Pro for unlimited analysis."
    }
    return "You've reached today's free limit. Upgrade to Kairo Pro for unlimited access."
  }
  return body?.error ? String(body.error) : `Request failed (${status})`
}
