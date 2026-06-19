import { useNow } from './useNow'
import { getMarketState } from '../utils/marketHours'

// Returns the current US equities market state, recomputed every minute.
// { state: 'open'|'pre'|'after'|'closed', label: string }
export function useMarketStatus() {
  const now = useNow(60_000)
  return getMarketState(now)
}
