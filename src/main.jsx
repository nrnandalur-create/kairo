import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { toast } from './utils/toast'

// Global error surfacing — catches anything React's ErrorBoundary can't:
// async failures, microtask rejections, listeners that throw. We rate-limit
// to one toast per 5s window so a misbehaving handler can't flood the UI.
let lastErrorAt = 0
function reportError(message) {
  const now = Date.now()
  if (now - lastErrorAt < 5000) return
  lastErrorAt = now
  toast.error(message)
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (!e?.message) return
    console.error('[window.error]', e.message, e.filename, e.lineno)
    reportError(`Unexpected error: ${e.message}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const msg = e?.reason?.message ?? String(e?.reason ?? 'Unhandled promise rejection')
    console.error('[unhandledrejection]', msg)
    reportError(`Unhandled error: ${msg}`)
  })

  // OAuth callback error catcher — Supabase redirects back here with
  // ?error=... or #error=... when the OAuth flow fails (provider not
  // enabled, redirect URL not whitelisted, user cancelled, etc). The
  // AuthModal is closed by that point, so the error needs to be caught
  // at the app shell. Strips the params from the URL after surfacing.
  try {
    const search   = new URLSearchParams(window.location.search)
    const hash     = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const errCode  = search.get('error')             ?? hash.get('error')
    const errDesc  = search.get('error_description') ?? hash.get('error_description')
    if (errCode || errDesc) {
      const pretty = decodeURIComponent((errDesc ?? errCode ?? '').replace(/\+/g, ' '))
      console.error('[oauth-callback]', errCode, errDesc)
      toast.error(`Sign-in failed: ${pretty}`, { ttl: 8000 })
      // Strip the params so a refresh doesn't re-show the toast.
      const cleanUrl = window.location.origin + window.location.pathname
      window.history.replaceState({}, '', cleanUrl)
    }
  } catch { /* defensive: never block app boot on this */ }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
