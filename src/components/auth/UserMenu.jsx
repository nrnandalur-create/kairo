import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { AuthModal } from './AuthModal'

const GREEN = '#1D9E75'
const BORDER = '#1a2e1f'

export function UserMenu() {
  const { user, signOut } = useAuth()
  const [showAuth, setShowAuth]     = useState(false)
  const [showDropdown, setDropdown] = useState(false)

  if (!user) return (
    <>
      <button
        onClick={() => setShowAuth(true)}
        style={{
          background: 'transparent',
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '7px 14px',
          color: '#a0b8a8',
          fontSize: 13,
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
        onMouseOver={e => e.currentTarget.style.borderColor = GREEN}
        onMouseOut={e => e.currentTarget.style.borderColor = BORDER}
      >
        Sign in
      </button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  )

  const initials = user.email?.slice(0, 2).toUpperCase() ?? '??'

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setDropdown(v => !v)}
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: '#0a1f14',
          border: `1px solid ${GREEN}`,
          color: GREEN,
          fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {initials}
      </button>

      {showDropdown && (
        <>
          {/* backdrop */}
          <div
            onClick={() => setDropdown(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          />
          <div style={{
            position: 'absolute', top: 40, right: 0, zIndex: 101,
            background: '#0f1611',
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: '6px 0',
            minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <div style={{ padding: '8px 14px 10px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, color: '#4a6351' }}>Signed in as</div>
              <div style={{ fontSize: 13, color: '#c0d4c8', marginTop: 2, wordBreak: 'break-all' }}>{user.email}</div>
            </div>
            <button
              onClick={() => { signOut(); setDropdown(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px',
                background: 'none', border: 'none',
                color: '#e24b4a', fontSize: 13, cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
