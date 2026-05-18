import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'

const BG    = '#080c0a'
const CARD  = '#0f1611'
const BORDER = '#1a2e1f'
const GREEN = '#1D9E75'
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
        onClick={signInWithGoogle}
        style={{ ...btnStyle, background: CARD, border: `1px solid ${BORDER}`, color: '#e0ede5', marginBottom: 16 }}
      >
        Continue with Google
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
          <div style={{ background: '#1a0a0a', border: '1px solid #4a1515', borderRadius: 8, padding: '8px 12px', color: '#e24b4a', fontSize: 13 }}>
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
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] bg-[#0f1611] border border-[#1a2e1f] rounded-2xl px-7 py-8"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
