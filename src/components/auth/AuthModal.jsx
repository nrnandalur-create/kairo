import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../hooks/useAuth'

const BG    = '#080c0a'
const CARD  = '#0f1611'
const BORDER = '#1a2e1f'
const GREEN = '#22B585'
const MUTED = '#4a6351'

export function AuthModal({ onClose }) {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode]       = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const fn = mode === 'signin' ? signIn : signUp
    const { error } = await fn(email, password)

    setLoading(false)
    if (error) {
      setError(error.message)
    } else if (mode === 'signup') {
      setSuccess(true)   // prompt to check email for confirmation
    } else {
      onClose?.()
    }
  }

  const inputStyle = {
    width: '100%',
    background: BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: '#e0ede5',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const btnStyle = {
    width: '100%',
    padding: '11px 0',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: loading ? 'not-allowed' : 'pointer',
    border: 'none',
    background: GREEN,
    color: '#fff',
    opacity: loading ? 0.7 : 1,
  }

  if (success) return (
    <Overlay onClose={onClose}>
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
        <p style={{ color: '#e0ede5', fontWeight: 500, marginBottom: 8 }}>Check your email</p>
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6 }}>
          We sent a confirmation link to <strong style={{ color: GREEN }}>{email}</strong>.<br/>
          Click it to activate your account, then sign in.
        </p>
        <button style={{ ...btnStyle, marginTop: 20 }} onClick={() => setSuccess(false)}>
          Back to sign in
        </button>
      </div>
    </Overlay>
  )

  return (
    <Overlay onClose={onClose}>
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#e0ede5', letterSpacing: '-0.3px' }}>
          {mode === 'signin' ? 'Welcome back' : 'Create account'}
        </div>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>
          {mode === 'signin' ? 'Sign in to Kairo' : 'Start tracking with Kairo'}
        </div>
      </div>

      {/* Google OAuth */}
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setError(null)
          setLoading(true)
          const { error } = await signInWithGoogle()
          // Note: when the OAuth flow succeeds, the browser is navigated away
          // before this resolves. We only reach the loading=false branch on
          // *synchronous* failures (provider not enabled, network blocked, etc).
          if (error) {
            console.error('[signInWithGoogle]', error)
            setError(error.message ?? 'Google sign-in failed. Check Supabase OAuth setup.')
            setLoading(false)
          }
        }}
        style={{
          ...btnStyle,
          background: CARD,
          border: `1px solid ${BORDER}`,
          color: '#e0ede5',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 01-1.8 2.71v2.26h2.92c1.71-1.57 2.69-3.89 2.69-6.62z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26a5.4 5.4 0 01-8.06-2.83H.96v2.33A8.99 8.99 0 009 18z" fill="#34A853"/>
          <path d="M3.98 10.73a5.43 5.43 0 010-3.46V4.94H.96a9.04 9.04 0 000 8.12l3.02-2.33z" fill="#FBBC04"/>
          <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A8.96 8.96 0 009 0 8.99 8.99 0 00.96 4.94l3.02 2.33A5.4 5.4 0 019 3.58z" fill="#EA4335"/>
        </svg>
        {loading ? 'Connecting…' : 'Continue with Google'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
        <span style={{ color: MUTED, fontSize: 12 }}>or</span>
        <div style={{ flex: 1, height: 1, background: BORDER }} />
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          style={inputStyle}
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          style={inputStyle}
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {error && (
          <div style={{ background: '#1a0a0a', border: '1px solid #4a1515', borderRadius: 8, padding: '8px 12px', color: '#ef5454', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button type="submit" style={btnStyle} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: MUTED }}>
        {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        <button
          onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
          style={{ background: 'none', border: 'none', color: GREEN, cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </Overlay>
  )
}

function Overlay({ onClose, children }) {
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0f1611',
          border: '1px solid #1a2e1f',
          borderRadius: 16,
          padding: '32px 28px',
          width: '100%',
          maxWidth: 380,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
