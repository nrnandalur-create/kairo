// ─────────────────────────────────────────────────────────────────────────────
// Position-aware context layer
// ─────────────────────────────────────────────────────────────────────────────
// Combines the market decision (from lib/decisionEngine) with the user's actual
// position (cost basis, shares, P/L) to produce risk-management CONTEXT and
// next steps — WITHOUT ever changing the market verdict (spec §6).
//
//   Market/technical evidence  → the outlook (verdict, direction, confidence)
//   Position data              → risk-management context only
//
// Rules enforced (and unit-tested):
//   • A large unrealized PROFIT never turns a bullish verdict into "sell/trim".
//   • A large unrealized LOSS never turns a deteriorating verdict into "hold".
//
// Pure + dependency-free so it is testable and deterministic.

function pctStr(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}
function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  const s = `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return n < 0 ? `-${s}` : s
}

// decision: the object returned by buildDecision (uses .direction, .verdict,
//   .verdictLabel, .risk, .healthScore).
// position: { gainPct, gainDollars, breakeven, price, shares } — the user's live
//   P/L. All optional; when absent we return only the market-level guidance.
export function buildPositionContext({ decision, position } = {}) {
  if (!decision) return null
  const dir = decision.direction // 'bullish' | 'neutral' | 'bearish'
  const hasPos = position && Number.isFinite(position.gainPct)
  const g = hasPos ? position.gainPct : null
  const bigWin = g != null && g >= 15
  const bigLoss = g != null && g <= -15

  // ── Position context paragraph — states P/L + break-even as CONTEXT, and
  //    explicitly decouples P/L from the verdict.
  let contextText = null
  if (hasPos) {
    const plLine = `You are ${g >= 0 ? 'up' : 'down'} ${pctStr(Math.abs(g)).replace('+', '')} (${money(position.gainDollars)}) on this position${position.breakeven != null ? `, with a break-even near ${money(position.breakeven)}` : ''}.`
    const decoupleLine = g >= 0
      ? 'Being in profit is a risk-management input, not a reason on its own to sell — the technical evidence, not your gain, sets the outlook.'
      : 'Being underwater is a risk-management input, not a reason on its own to hold — the technical evidence, not your loss, sets the outlook.'
    contextText = `${plLine} ${decoupleLine}`
  }

  // ── Position-specific risk note (separate from the market risk level).
  let positionRisk = null
  if (bigLoss) {
    positionRisk = 'This position carries a sizable unrealized loss; predefine the price level that would force you out so the decision is not made emotionally.'
  } else if (bigWin) {
    positionRisk = 'A large unrealized gain is worth protecting; a trailing stop keeps you in the trend while capping give-back.'
  }

  // ── Position-aware next steps (max 3), consistent with the MARKET verdict.
  const steps = []
  if (dir === 'bullish') {
    if (bigWin) {
      steps.push('The technical read remains constructive, so the setup does not call for exiting a winner; a trailing stop can protect the gain while staying in the trend.')
    } else if (bigLoss) {
      steps.push('The read is still constructive; if adding, do so only on confirmed support and size it so one drawdown does not define the position.')
    } else {
      steps.push('Staying with the position is consistent with the bullish evidence; a pullback toward support is a lower-risk place to add.')
    }
  } else if (dir === 'bearish') {
    if (bigLoss) {
      steps.push('The evidence is deteriorating; decide a stop level and act on it rather than holding purely to avoid realizing the loss.')
    } else if (bigWin) {
      steps.push('The weakening evidence — not your profit — argues for protecting the gain via a trailing stop or partial trim.')
    } else {
      steps.push('Reducing exposure into any near-term bounce is consistent with the bearish evidence.')
    }
  } else {
    steps.push(`Signals are mixed; holding while watching your break-even${position?.breakeven != null ? ` (${money(position.breakeven)})` : ''} and a defined invalidation level preserves optionality.`)
  }

  // Add the strongest market "what would change" as a watch item.
  if (decision.narrative?.whatWouldChange) {
    steps.push(dir === 'bearish'
      ? `Watch for what turns the read more bullish: ${lower(decision.narrative.whatWouldChange.moreBullishIf)}`
      : `Watch for what turns the read more bearish: ${lower(decision.narrative.whatWouldChange.moreBearishIf)}`)
  }

  return {
    contextText,
    positionRisk,
    steps: steps.slice(0, 3),
    // Verdict is passed straight through — position data never alters it.
    verdict: decision.verdict,
    verdictLabel: decision.verdictLabel,
    direction: dir,
  }
}

function lower(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s }
