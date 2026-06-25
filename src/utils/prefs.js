// User preferences singleton + localStorage persistence.
// Same pub/sub shape as src/utils/toast.js so the React hook can subscribe.
//
//   import { prefs } from '../utils/prefs'
//   prefs.get()                       // → { refreshMs, staleMs }
//   prefs.set('refreshMs', 60_000)    // → persists + notifies subscribers
//   prefs.reset()                     // → back to defaults
//
// In components, use the usePrefs hook instead of subscribing directly.

const STORAGE_KEY = 'kairo_prefs'

export const DEFAULTS = {
  // Auto-refresh interval for the current ticker. 0 = off.
  refreshMs: 300_000,   // 5 min
  // When the DataTimestamp dot turns amber.
  staleMs:   600_000,   // 10 min
  // Color theme. App was built dark-first; light is supported but a
  // small handful of low-priority surfaces may still read as dark.
  theme:     'dark',    // 'dark' | 'light'
  // Translucency multiplier for the glass classes. 1 = default frosted;
  // < 1 → more transparent (clear); > 1 → more opaque (solid-ish).
  glassMult: 1,         // 0.2 – 1.5
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
  catch { /* quota / private mode — fall through */ }
}

let state = load()
const listeners = new Set()
function emit() { listeners.forEach(fn => fn(state)) }

export const prefs = {
  get()           { return state },
  set(key, value) {
    if (state[key] === value) return
    state = { ...state, [key]: value }
    save(state)
    emit()
  },
  reset() {
    state = { ...DEFAULTS }
    save(state)
    emit()
  },
  _subscribe(fn) {
    listeners.add(fn)
    fn(state)
    return () => listeners.delete(fn)
  },
}
