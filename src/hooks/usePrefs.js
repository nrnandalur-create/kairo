import { useEffect, useState } from 'react'
import { prefs } from '../utils/prefs'

// Reactive prefs accessor. Returns the current prefs object; components
// re-render when any pref changes.
export function usePrefs() {
  const [state, setState] = useState(prefs.get())
  useEffect(() => prefs._subscribe(setState), [])
  return state
}
