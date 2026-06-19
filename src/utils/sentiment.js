const POS_WORDS = ['beat', 'beats', 'surge', 'surges', 'gain', 'gains', 'growth', 'record',
  'profit', 'profits', 'strong', 'bullish', 'upgrade', 'upgraded', 'outperform', 'rally',
  'soar', 'soars', 'jump', 'jumps', 'rise', 'rises', 'exceed', 'exceeds', 'positive', 'top']
const NEG_WORDS = ['miss', 'misses', 'fall', 'falls', 'drop', 'drops', 'decline', 'declines',
  'loss', 'losses', 'weak', 'bearish', 'downgrade', 'downgraded', 'underperform', 'crash',
  'plunge', 'plunges', 'slump', 'slumps', 'warning', 'risk', 'cut', 'cuts', 'disappoint',
  'disappoints', 'concern', 'concerns', 'below', 'layoff', 'layoffs']

export function detectSentiment(headline) {
  const h   = headline.toLowerCase()
  const pos = POS_WORDS.filter(w => h.includes(w)).length
  const neg = NEG_WORDS.filter(w => h.includes(w)).length
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}
