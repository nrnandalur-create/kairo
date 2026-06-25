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
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
