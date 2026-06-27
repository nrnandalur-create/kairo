// "Last time you looked at TICKER" — slim banner above the Recommendation card
// showing the diff between the user's previous view and the current verdict.
//
// Renders nothing when there's no prior history (first view of a ticker, or
// the user isn't signed in). Strictly additive — Recommendation is untouched.

function timeAgo(ts) {
  if (!ts) return 'previously'
  const diff = Date.now() - new Date(ts).getTime()
  const day  = 86_400_000
  if (diff < 60_000)        return 'moments ago'
  if (diff < day)           return `${Math.round(diff / 3_600_000)}h ago`
  if (diff < day * 7)       return `${Math.round(diff / day)}d ago`
  if (diff < day * 30)      return `${Math.round(diff / (day * 7))}w ago`
  return `${Math.round(diff / (day * 30))}mo ago`
}

const VERDICT_COLOR = { BUY: '#22B585', HOLD: '#e3a234', SELL: '#ef5454' }
const VERDICT_GLYPH = { BUY: '▲',       HOLD: '─',      SELL: '▼' }

export default function VerdictMemory({ previous, current, currentPrice }) {
  if (!previous || !current?.recommendation) return null

  const prevVerdict = previous.verdict
  const curVerdict  = current.recommendation
  const flipped     = prevVerdict !== curVerdict

  const prevConf = previous.confidence ?? 0
  const curConf  = current.confidence  ?? 0
  const confDelta = curConf - prevConf

  const prevPrice = Number(previous.price) || 0
  const curPrice  = Number(currentPrice)   || 0
  const priceDelta = prevPrice > 0 ? ((curPrice - prevPrice) / prevPrice) * 100 : 0

  return (
    <div className="w-full glass-card rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap text-[12px] animate-enter">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)] shrink-0">
        Since you last looked
      </span>
      <span className="text-[var(--c-text-fainter)]">·</span>
      <span className="text-[var(--c-text-faint)]">{timeAgo(previous.viewed_at)}</span>
      <span className="text-[var(--c-text-fainter)]">·</span>

      {/* Verdict flip */}
      <span className="inline-flex items-center gap-1.5">
        <span className="font-bold tabular-nums" style={{ color: VERDICT_COLOR[prevVerdict] ?? 'var(--c-text-faint)' }}>
          {VERDICT_GLYPH[prevVerdict]} {prevVerdict}
        </span>
        <span className="text-[var(--c-text-fainter)]">→</span>
        <span className="font-bold tabular-nums" style={{ color: VERDICT_COLOR[curVerdict] ?? 'var(--c-text-faint)' }}>
          {VERDICT_GLYPH[curVerdict]} {curVerdict}
        </span>
        {flipped && (
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#22B585]/80 ml-1">flipped</span>
        )}
      </span>

      <span className="text-[var(--c-text-fainter)]">·</span>

      {/* Price delta */}
      {prevPrice > 0 && (
        <>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <span className="text-[var(--c-text-faint)]">${prevPrice.toFixed(2)}</span>
            <span className="text-[var(--c-text-fainter)]">→</span>
            <span className="text-[var(--c-text)] font-semibold">${curPrice.toFixed(2)}</span>
            <span
              className="text-[10px] font-bold ml-0.5"
              style={{ color: priceDelta >= 0 ? '#22B585' : '#ef5454' }}
            >
              {priceDelta >= 0 ? '+' : ''}{priceDelta.toFixed(2)}%
            </span>
          </span>
          <span className="text-[var(--c-text-fainter)]">·</span>
        </>
      )}

      {/* Confidence delta */}
      <span className="inline-flex items-center gap-1 tabular-nums">
        <span className="text-[var(--c-text-faint)]">Conf {prevConf}</span>
        <span className="text-[var(--c-text-fainter)]">→</span>
        <span className="text-[var(--c-text)] font-semibold">{curConf}</span>
        {confDelta !== 0 && (
          <span
            className="text-[10px] font-bold ml-0.5"
            style={{ color: confDelta > 0 ? '#22B585' : '#ef5454' }}
          >
            {confDelta > 0 ? '+' : ''}{confDelta}
          </span>
        )}
      </span>
    </div>
  )
}
