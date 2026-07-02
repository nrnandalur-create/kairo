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
  // Auto-refresh interval for the current ticker. 0 = off. null = adaptive
  // (the hook picks 30s during market hours, 90s pre/after-market).
  // Adaptive is the right default for "always within 0.5 of Finviz" since
  // RSI/MACD/BB shift slowly enough that a 30s tick keeps the displayed
  // values within ~0.3 of the live reference on liquid US large-caps.
  refreshMs: null,
  // When the DataTimestamp dot turns amber. With the new 30s adaptive
  // cadence anything >2min suggests something failed.
  staleMs:   120_000,   // 2 min
  // Color theme. App was built dark-first; light is supported but a
  // small handful of low-priority surfaces may still read as dark.
  theme:     'dark',    // 'dark' | 'light'
  // Translucency multiplier for the glass classes. 1 = default frosted;
  // < 1 → more transparent (clear); > 1 → more opaque (solid-ish).
  glassMult: 1,         // 0.2 – 1.5
  // Beginner Mode — hides the advanced metric cells and indicator tiles
  // (Beta, VWAP, MACD, BB Position, EPS Gr. 5Y, P/S, SMA 200) so the
  // headline surfaces stay approachable for users new to markets. Every
  // metric that's still visible has a plain-English hover tooltip.
  beginnerMode: false,
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
