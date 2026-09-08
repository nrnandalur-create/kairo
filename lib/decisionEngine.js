// ─────────────────────────────────────────────────────────────────────────────
// Kairo Unified Decision Engine
// ─────────────────────────────────────────────────────────────────────────────
// One deterministic layer that turns technical indicators into a SINGLE coherent
// verdict. Indicators are treated as *evidence*, never as independent BUY/SELL
// votes. All user-facing fields (verdict, confidence, risk, health, narrative,
// next steps) are derived from the same scores, so they can never contradict
// each other.
//
// Pipeline (see spec §14):
//   inputs → normalized signals → weighted + de-correlated evidence
//          → bullish / bearish / neutral / risk scores
//          → verdict → confidence → health → deterministic narrative
//          → consistency validation
//
// Pure and dependency-free so it is trivially testable and produces identical
// output for identical input. Lives in /lib so the API can import it without
// counting against Vercel's function budget; also imported by tests.

// ── Documented weights ───────────────────────────────────────────────────────
// Base influence of each evidence category on the directional decision. Trend
// leads because a durable trend dominates short-term oscillations; momentum
// confirms; overextension (RSI/BB) is mean-reversion evidence that is
// deliberately down-weighted so it can nudge but not dominate. Volume only
// confirms conviction behind a move, so it is the lightest directional voice.
export const WEIGHTS = {
  trend:        1.00, // price vs SMA50/SMA200 structure
  macd:         0.85, // trend-following momentum
  momentum:     0.55, // recent price change (5d)
  overextension:0.60, // RSI + Bollinger position (mean-reversion evidence)
  volume:       0.30, // participation / confirmation
}

// Correlation groups: signals that measure the SAME underlying behavior share a
// group. A group's combined directional contribution is capped at
// `strongest × GROUP_DAMPEN` instead of the raw sum, so three overextension
// gauges (RSI, Bollinger, and a stochastic if present) cannot outvote trend +
// momentum simply by agreeing with each other.
const GROUP_DAMPEN = 1.30

// Verdict thresholds on the net directional score (−100 bearish … +100 bullish).
const VERDICT_BANDS = [
  { min:  50, verdict: 'STRONG_BUY',  label: 'Strong Buy',  direction: 'bullish' },
  { min:  18, verdict: 'BUY',         label: 'Buy',         direction: 'bullish' },
  { min: -18, verdict: 'HOLD',        label: 'Hold',        direction: 'neutral' },
  { min: -35, verdict: 'REDUCE',      label: 'Trim / Reduce', direction: 'bearish' },
  { min: -60, verdict: 'SELL',        label: 'Sell',        direction: 'bearish' },
  { min: -Infinity, verdict: 'STRONG_SELL', label: 'Strong Sell', direction: 'bearish' },
]

const RISK_BANDS = [
  { min: 80, level: 'EXTREME',  label: 'Extreme Risk'  },
  { min: 62, level: 'HIGH',     label: 'High Risk'     },
  { min: 44, level: 'ELEVATED', label: 'Elevated Risk' },
  { min: 24, level: 'MODERATE', label: 'Moderate Risk' },
  { min: -Infinity, level: 'LOW', label: 'Low Risk'    },
]

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const round = (n) => Math.round(n)

// ── Bollinger descriptor (spec §7) ───────────────────────────────────────────
// Never "111% of the band". Describe position relative to the bands in plain,
// non-directional-verdict language, with the real percentage distance.
export function describeBollinger(bb, price) {
  if (!bb || price == null) return { zone: 'unknown', text: 'Bollinger Band data unavailable', pctFromEdge: null }
  const { upper, lower } = bb
  const mid = (upper + lower) / 2
  if (price > upper) {
    const pct = ((price - upper) / upper) * 100
    return { zone: 'above_upper', pctFromEdge: +pct.toFixed(1),
      text: `Price is ${pct.toFixed(1)}% above the upper Bollinger Band` }
  }
  if (price < lower) {
    const pct = ((lower - price) / lower) * 100
    return { zone: 'below_lower', pctFromEdge: +pct.toFixed(1),
      text: `Price is ${pct.toFixed(1)}% below the lower Bollinger Band` }
  }
  // Inside the bands — how close to an edge (0 = at mid, 1 = at an edge).
  const toUpper = (upper - price) / (upper - mid || 1) // 0 at upper, 1 at mid
  const toLower = (price - lower) / (mid - lower || 1)
  if (toUpper <= 0.15) return { zone: 'near_upper', pctFromEdge: 0, text: 'Price is trading near the upper Bollinger Band' }
  if (toLower <= 0.15) return { zone: 'near_lower', pctFromEdge: 0, text: 'Price is trading near the lower Bollinger Band' }
  return { zone: 'inside', pctFromEdge: 0, text: 'Price is trading inside the Bollinger Bands' }
}

// ── Signal normalizers ───────────────────────────────────────────────────────
// Each returns { key, label, category, group, direction, strength(0-100),
// explanation } using EVIDENCE language — never "BUY"/"SELL".
// direction ∈ {bullish, neutral, bearish}; strength is conviction 0-100.

function trendSignal({ price, sma50, sma200 }) {
  if (price == null || sma50 == null) return null
  const above50 = price > sma50
  const gap50 = ((price - sma50) / sma50) * 100
  let direction, strength, explanation
  if (sma200 != null) {
    const stacked = sma50 > sma200
    if (above50 && stacked) {
      direction = 'bullish'
      strength = clamp(45 + Math.abs(gap50) * 4, 45, 95)
      explanation = 'Price is above a rising 50-day average that sits over the 200-day — the trend structure supports the bullish case.'
    } else if (!above50 && !stacked) {
      direction = 'bearish'
      strength = clamp(45 + Math.abs(gap50) * 4, 45, 95)
      explanation = 'Price is below a 50-day average that sits under the 200-day — the trend structure adds bearish evidence.'
    } else {
      direction = 'neutral'
      strength = 35
      explanation = 'The 50-day and 200-day averages are not aligned, so trend evidence is mixed.'
    }
  } else {
    direction = above50 ? 'bullish' : 'bearish'
    strength = clamp(35 + Math.abs(gap50) * 4, 30, 80)
    explanation = above50
      ? 'Price holds above its 50-day average, supporting the bullish case.'
      : 'Price trades below its 50-day average, adding bearish evidence.'
  }
  return { key: 'trend', label: 'Trend', category: 'trend', group: 'trend', direction, strength: round(strength), explanation }
}

function macdSignal({ macd, price }) {
  if (!macd || macd.value == null || macd.signal == null) return null
  const spread = macd.value - macd.signal
  // Normalize the histogram against price so it is comparable across tickers.
  const rel = price ? Math.abs(spread) / price * 1000 : Math.abs(spread)
  const strength = clamp(40 + rel * 30, 30, 92)
  const direction = spread > 0 ? 'bullish' : spread < 0 ? 'bearish' : 'neutral'
  const explanation = direction === 'bullish'
    ? 'MACD is above its signal line, providing bullish momentum evidence.'
    : direction === 'bearish'
    ? 'MACD is below its signal line, providing bearish momentum evidence.'
    : 'MACD is flat against its signal line, offering little momentum evidence.'
  return { key: 'macd', label: 'MACD', category: 'momentum', group: 'momentum', direction, strength: round(strength), explanation }
}

function momentumSignal({ priceChange5d }) {
  const p = typeof priceChange5d === 'number' ? priceChange5d
    : (priceChange5d != null && priceChange5d !== 'N/A' ? parseFloat(priceChange5d) : null)
  if (p == null || Number.isNaN(p)) return null
  const direction = p > 1 ? 'bullish' : p < -1 ? 'bearish' : 'neutral'
  const strength = clamp(30 + Math.abs(p) * 4, 25, 85)
  const explanation = direction === 'bullish'
    ? `Price is up ${p.toFixed(1)}% over the last 5 sessions, supporting the bullish case.`
    : direction === 'bearish'
    ? `Price is down ${Math.abs(p).toFixed(1)}% over the last 5 sessions, adding bearish evidence.`
    : 'Price is roughly flat over the last 5 sessions — little momentum evidence either way.'
  return { key: 'momentum', label: 'Momentum (5d)', category: 'momentum', group: 'momentum', direction, strength: round(strength), explanation }
}

// RSI + Bollinger both live in the "overextension" group. Each is emitted as
// its own signal (so the UI can show both) but the group is dampened when they
// combine, preventing double-counting of the same mean-reversion behavior.
function rsiSignal({ rsi }) {
  if (rsi == null) return null
  let direction, strength, explanation
  if (rsi >= 70) {
    direction = 'bearish'
    strength = clamp(40 + (rsi - 70) * 3, 40, 90)
    explanation = `RSI at ${rsi.toFixed(0)} indicates short-term overextension, which raises near-term pullback risk.`
  } else if (rsi <= 30) {
    direction = 'bullish'
    strength = clamp(40 + (30 - rsi) * 3, 40, 90)
    explanation = `RSI at ${rsi.toFixed(0)} indicates the move is oversold, which supports a potential mean-reversion bounce.`
  } else if (rsi >= 55) {
    direction = 'bullish'
    strength = clamp((rsi - 55) * 2.5, 15, 45)
    explanation = `RSI at ${rsi.toFixed(0)} reflects firm but not stretched momentum.`
  } else if (rsi <= 45) {
    direction = 'bearish'
    strength = clamp((45 - rsi) * 2.5, 15, 45)
    explanation = `RSI at ${rsi.toFixed(0)} reflects soft momentum.`
  } else {
    direction = 'neutral'
    strength = 20
    explanation = `RSI at ${rsi.toFixed(0)} is in a neutral range.`
  }
  return { key: 'rsi', label: 'RSI (14)', category: 'momentum', group: 'overextension', direction, strength: round(strength), explanation }
}

function bollingerSignal({ bb, price }) {
  if (!bb || price == null) return null
  const d = describeBollinger(bb, price)
  let direction, strength, explanation
  switch (d.zone) {
    case 'above_upper':
      direction = 'bearish'; strength = clamp(45 + d.pctFromEdge * 6, 45, 88)
      explanation = `${d.text}, indicating short-term overextension and increased pullback risk.`
      break
    case 'near_upper':
      direction = 'bearish'; strength = 35
      explanation = `${d.text}, a mild sign of short-term overextension.`
      break
    case 'below_lower':
      direction = 'bullish'; strength = clamp(45 + d.pctFromEdge * 6, 45, 88)
      explanation = `${d.text}, indicating the move is stretched to the downside — a potential mean-reversion setup.`
      break
    case 'near_lower':
      direction = 'bullish'; strength = 35
      explanation = `${d.text}, a mild oversold sign.`
      break
    default:
      direction = 'neutral'; strength = 15
      explanation = `${d.text}, offering little directional evidence.`
  }
  return { key: 'bollinger', label: 'Bollinger', category: 'volatility', group: 'overextension', direction, strength: round(strength), explanation, bbDescriptor: d }
}

function volumeSignal({ volume, priceChange5d }) {
  if (!volume || volume.ratio == null) return null
  // Volume has no direction of its own — it confirms the prevailing move. We
  // align it with recent price action and scale strength by how elevated it is.
  const p = typeof priceChange5d === 'number' ? priceChange5d : parseFloat(priceChange5d)
  const moveDir = !Number.isFinite(p) || Math.abs(p) < 1 ? 'neutral' : p > 0 ? 'bullish' : 'bearish'
  if (moveDir === 'neutral' || volume.ratio < 1.15) {
    return { key: 'volume', label: 'Volume', category: 'volume', group: 'volume', direction: 'neutral', strength: 15,
      explanation: volume.ratio >= 1.15
        ? 'Volume is elevated but the move is directionless, so it adds little evidence.'
        : 'Volume is near its average, offering weak confirmation.' }
  }
  const strength = clamp(25 + (volume.ratio - 1) * 40, 25, 70)
  return { key: 'volume', label: 'Volume', category: 'volume', group: 'volume', direction: moveDir, strength: round(strength),
    explanation: `Volume is running ${volume.ratio.toFixed(1)}× its average, ${moveDir === 'bullish' ? 'confirming buying interest behind the advance' : 'confirming selling pressure behind the decline'}.` }
}

// ── Evidence combination ─────────────────────────────────────────────────────
function combine(signals) {
  // Effective weight per signal, with correlation-group dampening applied so a
  // crowded group can't dominate purely by internal agreement.
  const byGroup = {}
  for (const s of signals) (byGroup[s.group] ||= []).push(s)

  let bullish = 0, bearish = 0, neutral = 0, totalWeight = 0
  const contributions = []

  for (const [group, members] of Object.entries(byGroup)) {
    const baseWeight = group === 'overextension' ? WEIGHTS.overextension
      : group === 'trend' ? WEIGHTS.trend
      : group === 'momentum' ? null // momentum group holds macd + momentum, weighted individually below
      : group === 'volume' ? WEIGHTS.volume
      : 0.4

    if (group === 'momentum') {
      // MACD and 5d-momentum are related but not redundant; weight each by its
      // own documented weight (macd heavier) rather than a shared cap.
      for (const s of members) {
        const w = s.key === 'macd' ? WEIGHTS.macd : WEIGHTS.momentum
        pushContribution(s, w)
      }
      continue
    }

    if (members.length === 1) {
      pushContribution(members[0], baseWeight)
      continue
    }
    // Multiple correlated members: cap combined weight at strongest × dampen.
    const capped = baseWeight * GROUP_DAMPEN
    const strongest = members.reduce((a, b) => (b.strength > a.strength ? b : a))
    // Distribute the capped weight proportionally to each member's strength so
    // the group's *direction* reflects its members but its *magnitude* is bounded.
    const strengthSum = members.reduce((s, m) => s + m.strength, 0) || 1
    for (const s of members) {
      const w = capped * (s.strength / strengthSum)
      pushContribution(s, w, strongest.key === s.key)
    }
  }

  function pushContribution(s, weight, isGroupLead = true) {
    const magnitude = (s.strength / 100) * weight
    totalWeight += weight
    if (s.direction === 'bullish') bullish += magnitude
    else if (s.direction === 'bearish') bearish += magnitude
    else neutral += magnitude
    contributions.push({ key: s.key, direction: s.direction, strength: s.strength, weight: +weight.toFixed(3), magnitude: +magnitude.toFixed(3), isGroupLead })
  }

  // Normalize to 0-100 against the maximum achievable (all weight at full strength).
  const norm = (v) => totalWeight ? clamp((v / totalWeight) * 100, 0, 100) : 0
  const bullishScore = norm(bullish)
  const bearishScore = norm(bearish)
  const neutralScore = norm(neutral)
  const net = bullishScore - bearishScore // −100 … +100

  return { bullishScore: +bullishScore.toFixed(1), bearishScore: +bearishScore.toFixed(1), neutralScore: +neutralScore.toFixed(1), net: +net.toFixed(1), totalWeight: +totalWeight.toFixed(2), contributions }
}

// ── Risk score (independent of direction, spec §2) ───────────────────────────
function computeRisk({ signals, bb, price, priceChange5d, hi52, lo52, net, bullishScore, bearishScore }) {
  let risk = 20 // baseline
  const reasons = []

  // Volatility: Bollinger band width relative to price.
  if (bb && price) {
    const width = ((bb.upper - bb.lower) / price) * 100
    if (width > 18) { risk += 22; reasons.push('wide Bollinger bands signal elevated volatility') }
    else if (width > 12) { risk += 12; reasons.push('above-average volatility') }
    else if (width < 6) { risk -= 6 }
  }
  // Overextension beyond a band raises risk regardless of direction, and an
  // EXTREME reading (e.g. 11% above the upper band) must matter more than a
  // marginal one — the contribution scales with how far beyond price is (§6).
  const bbSig = signals.find(s => s.key === 'bollinger')
  const bbZone = bbSig?.bbDescriptor?.zone
  if (bbZone === 'above_upper' || bbZone === 'below_lower') {
    const over = bbSig.bbDescriptor.pctFromEdge ?? 0
    risk += clamp(12 + over * 2.5, 12, 32)
    reasons.push(over >= 5
      ? `price is trading ${over}% beyond a Bollinger Band (significant short-term overextension)`
      : 'price is trading beyond a Bollinger Band')
  }
  // Sharp recent moves.
  const p = typeof priceChange5d === 'number' ? priceChange5d : parseFloat(priceChange5d)
  if (Number.isFinite(p) && Math.abs(p) > 10) { risk += 12; reasons.push('a large 5-day price swing') }
  // Conflicting evidence is itself a risk (whipsaw).
  const conflict = Math.min(bullishScore, bearishScore)
  if (conflict > 25) { risk += 14; reasons.push('bullish and bearish signals are in conflict') }
  else if (conflict > 15) { risk += 7 }
  // Downside proximity: near 52-week low with bearish tilt.
  if (lo52 && price) {
    const aboveLow = ((price - lo52) / lo52) * 100
    if (aboveLow < 8 && net < 0) { risk += 12; reasons.push('price is near its 52-week low while evidence leans bearish') }
  }
  if (hi52 && price) {
    const belowHigh = ((hi52 - price) / hi52) * 100
    if (belowHigh < 3 && net > 0) { risk += 6; reasons.push('price is extended near its 52-week high') }
  }

  const score = clamp(round(risk), 0, 100)
  const band = RISK_BANDS.find(b => score >= b.min)
  return { score, level: band.level, label: band.label, reasons }
}

// ── Health score (setup quality, distinct from confidence, spec §5) ──────────
// Health reflects how clean/ownable the CURRENT setup is: aligned trend + clean
// momentum + contained risk score high; deteriorating trend + high risk score
// low. It is signed by direction so a strong bearish setup scores LOW (a poor
// setup to be long) even when confidence in that bearish read is high.
function computeHealth({ signals, net, riskScore, neutralScore }) {
  const trend = signals.find(s => s.key === 'trend')
  const macd  = signals.find(s => s.key === 'macd')

  const dirSign = (s) => s ? (s.direction === 'bullish' ? 1 : s.direction === 'bearish' ? -1 : 0) : 0

  let health = 50
  health += dirSign(trend) * (trend ? trend.strength : 0) * 0.22   // trend quality, up to ±~21
  health += dirSign(macd) * (macd ? macd.strength : 0) * 0.15      // momentum quality, up to ±~14
  health += (net / 100) * 12                                       // overall directional lean, ±12
  health -= (riskScore / 100) * 22                                 // risk drags quality, up to −22
  health -= (neutralScore / 100) * 8                               // indecision drags quality
  return clamp(round(health), 0, 100)
}

// ── Confidence (agreement + strength + data quality, spec §4) ────────────────
function computeConfidence({ bullishScore, bearishScore, net, signals, expectedSignals, direction }) {
  const total = bullishScore + bearishScore
  // Agreement: how lopsided the evidence is (0 = perfectly split, 1 = unanimous).
  const agreement = total > 0 ? Math.abs(net) / total : 0
  // Strength of the signals that voted WITH the verdict direction.
  const aligned = signals.filter(s =>
    (direction === 'bullish' && s.direction === 'bullish') ||
    (direction === 'bearish' && s.direction === 'bearish') ||
    (direction === 'neutral')
  )
  const avgStrength = aligned.length ? aligned.reduce((s, x) => s + x.strength, 0) / aligned.length : 40
  // Data quality: how many of the expected signals we actually have.
  const dataQuality = clamp(signals.length / expectedSignals, 0, 1)

  let confidence
  if (direction === 'neutral') {
    // Mixed/conflicting evidence. Confidence reflects genuine uncertainty and
    // sits in a mid band — 50 is NOT "bad", it means "evenly matched".
    confidence = 50 + (1 - agreement) * 8 - (avgStrength < 40 ? 5 : 0)
    confidence = clamp(confidence, 42, 62)
  } else {
    confidence = 100 * (0.55 * agreement + 0.30 * (avgStrength / 100) + 0.15 * dataQuality)
    // Agreement ceiling: a directional call cannot earn high confidence while
    // important signals strongly disagree. At full agreement the cap is 95; as
    // opposing evidence grows the ceiling falls, so 80%+ requires genuine
    // consensus (spec §2). Strong agreement 80-95, moderate conflict 65-79,
    // weak edge 55-64 emerges naturally from this.
    confidence = Math.min(confidence, 60 + agreement * 35)
    confidence = clamp(confidence, 55, 95)
  }
  return {
    value: round(confidence),
    breakdown: { agreement: +agreement.toFixed(2), avgStrength: round(avgStrength), dataQuality: +dataQuality.toFixed(2) },
  }
}

// ── Natural-language builders (deterministic, probabilistic phrasing §11) ────
// Short clauses used to compose the WHY paragraph. Kept separate from each
// signal's full `explanation` so the summary reads as flowing prose rather
// than a list of sentences.
const PHRASES = {
  trend:     { bullish: 'the broader trend remains constructive',            bearish: 'the broader trend is deteriorating',                 neutral: 'the trend is roughly flat' },
  macd:      { bullish: 'MACD is holding bullish',                           bearish: 'MACD has turned bearish',                            neutral: 'MACD is flat' },
  momentum:  { bullish: 'recent 5-day momentum is positive',                bearish: 'recent 5-day momentum is negative',                  neutral: 'recent momentum is flat' },
  rsi:       { bullish: 'RSI shows oversold conditions',                    bearish: 'RSI is stretched into overbought territory',         neutral: 'RSI is neutral' },
  bollinger: { bullish: 'price is stretched below the lower Bollinger Band', bearish: 'price is extended above the upper Bollinger Band',    neutral: 'price sits inside the Bollinger Bands' },
  volume:    { bullish: 'volume is confirming the advance',                 bearish: 'volume is confirming the decline',                   neutral: 'volume is unremarkable' },
}
function phraseFor(s) { return PHRASES[s.key]?.[s.direction] ?? s.label.toLowerCase() }
function joinClauses(arr) {
  if (!arr.length) return ''
  if (arr.length === 1) return arr[0]
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

// Normalize a level to { price, type, source }. Accepts either a plain number
// (legacy) or a labeled object built client-side from a real calculation.
function normLevel(l) {
  if (l == null) return null
  if (typeof l === 'number') return { price: l, type: null, source: 'a recent swing level' }
  return { price: l.price, type: l.type ?? null, source: l.source ?? 'a recent level' }
}

// WHY references the strongest 2-3 bullish and 1-2 bearish contributors BY
// IMPACT on the score (magnitude = strength × effective weight), then states the
// verdict + confidence — so the number is justified by the visible evidence
// (spec §1). WHAT-WOULD-CHANGE lists only conditions Kairo can actually monitor,
// tied to calculated signals + levels (spec §4).
function buildNarrative({ verdictLabel, direction, signals, risk, support, resistance, contributions, confidence }) {
  const impact = Object.fromEntries((contributions ?? []).map(c => [c.key, c.magnitude]))
  const rank = dir => signals.filter(s => s.direction === dir).sort((a, b) => (impact[b.key] ?? 0) - (impact[a.key] ?? 0))
  const topBull = rank('bullish').slice(0, 3)
  const topBear = rank('bearish').slice(0, 3)
  const bullClause = joinClauses(topBull.map(phraseFor))
  const bearClause = joinClauses(topBear.map(phraseFor))

  let why
  if (direction === 'bullish') {
    const lead = bullClause ? `${cap(bullClause)}.` : 'The bullish factors are modest.'
    const off  = bearClause ? ` However, ${bearClause}, which increases near-term risk.` : ''
    why = `${lead}${off} Bullish evidence still outweighs bearish, producing a ${verdictLabel} rating with ${confidence}% confidence.`
  } else if (direction === 'bearish') {
    const lead = bearClause ? `${cap(bearClause)}.` : 'The bearish factors are modest.'
    const off  = bullClause ? ` The main offset is that ${bullClause}.` : ''
    why = `${lead}${off} Bearish evidence still outweighs bullish, producing a ${verdictLabel} rating with ${confidence}% confidence.`
  } else {
    why = `Bullish evidence (${bullClause || 'limited'}) is closely matched by bearish evidence (${bearClause || 'limited'}), producing a ${verdictLabel} at ${confidence}% confidence — the signals conflict rather than align.`
  }

  const primaryRisk = risk.reasons.length
    ? `The main risk to this setup is ${risk.reasons[0]}${risk.reasons[1] ? `, compounded by ${risk.reasons[1]}` : ''}. This raises the probability of an adverse move against the position.`
    : 'No single dominant risk stands out, but no setup is without downside — size accordingly.'

  const nearSupport = normLevel(Array.isArray(support) && support.length ? support[0] : null)
  const nearRes     = normLevel(Array.isArray(resistance) && resistance.length ? resistance[0] : null)
  const hasMacd  = signals.some(s => s.key === 'macd')
  const hasTrend = signals.some(s => s.key === 'trend')
  const bbBearish = signals.some(s => s.key === 'bollinger' && s.direction === 'bearish')

  const moreBullishIf = []
  if (nearRes) moreBullishIf.push(`Price reclaims and holds above ${nearRes.source} near ${fmt(nearRes.price)}`)
  else if (nearSupport) moreBullishIf.push(`Price holds above ${nearSupport.source} near ${fmt(nearSupport.price)}`)
  if (hasMacd) moreBullishIf.push('MACD momentum strengthens (histogram expands above the signal line)')
  moreBullishIf.push(bbBearish
    ? 'Bollinger overextension cools without the trend breaking down'
    : 'The trend score improves as price extends above its moving averages')

  const moreBearishIf = []
  if (nearSupport) moreBearishIf.push(`A close below ${nearSupport.source} near ${fmt(nearSupport.price)}`)
  else moreBearishIf.push('A close below the nearest calculated support level')
  if (hasMacd) moreBearishIf.push('MACD crosses below its signal line')
  if (hasTrend) moreBearishIf.push('The trend score deteriorates as price loses its 50-day average')

  return {
    why,
    primaryRisk,
    whatWouldChange: {
      moreBullishIf: moreBullishIf.slice(0, 3),
      moreBearishIf: moreBearishIf.slice(0, 3),
    },
  }
}

function fmt(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}` }

// ── Consistency validation (spec §3) ─────────────────────────────────────────
// Belt-and-suspenders: assert nothing in the output contradicts the verdict.
const BANNED = [/\bforces? (a )?(sell|buy)\b/i, /\bwill (rally|pull ?back|crash|soar)\b/i, /\bguaranteed\b/i]
function validate(result) {
  const issues = []
  const { verdict, direction, scores } = result
  // Direction must match the net score sign.
  if (direction === 'bullish' && scores.net < 0) issues.push('verdict is bullish but net score is negative')
  if (direction === 'bearish' && scores.net > 0) issues.push('verdict is bearish but net score is positive')
  // No text field may use overconfident / contradicting language.
  const wtc = result.narrative.whatWouldChange
  const texts = [result.narrative.why, result.narrative.primaryRisk,
    ...(wtc?.moreBullishIf ?? []), ...(wtc?.moreBearishIf ?? []),
    ...(result.nextSteps || [])]
  for (const t of texts) for (const re of BANNED) if (re.test(t)) issues.push(`banned phrase in copy: "${t}"`)
  // A bullish verdict must not carry a net-bearish signal majority in its
  // top-line evidence, and vice-versa (defensive; scores already enforce this).
  if (verdict === 'HOLD' && Math.abs(scores.net) > 20) issues.push('HOLD emitted with a decisive net score')
  return { ok: issues.length === 0, issues }
}

// ── Public API ───────────────────────────────────────────────────────────────
// Returns the full decision object. `noTechnicals` short-circuits to an explicit
// "unavailable" result — we never fabricate a verdict on missing data.
export function buildDecision(input = {}) {
  const {
    ticker = null, price = null,
    rsi = null, macd = null, bb = null,
    sma50 = null, sma200 = null,
    volume = null, priceChange5d = null,
    hi52 = null, lo52 = null,
    support = [], resistance = [],
    noTechnicals = false,
  } = input

  const coreCount = [rsi, macd, bb].filter(v => v != null).length
  if (noTechnicals || coreCount === 0) {
    return { unavailable: true, reason: 'insufficient technical data', availableTechnicals: coreCount }
  }

  // 1. Normalize evidence.
  const signals = [
    trendSignal({ price, sma50, sma200 }),
    macdSignal({ macd, price }),
    momentumSignal({ priceChange5d }),
    rsiSignal({ rsi }),
    bollingerSignal({ bb, price }),
    volumeSignal({ volume, priceChange5d }),
  ].filter(Boolean)

  // 2. Combine into scores.
  const scores = combine(signals)

  // 3. Verdict from net directional score.
  const band = VERDICT_BANDS.find(b => scores.net >= b.min)

  // 4. Risk (independent), 5. Health (setup quality), 6. Confidence (agreement).
  const risk = computeRisk({ signals, bb, price, priceChange5d, hi52, lo52, support, net: scores.net, bullishScore: scores.bullishScore, bearishScore: scores.bearishScore })
  const health = computeHealth({ signals, net: scores.net, riskScore: risk.score, neutralScore: scores.neutralScore })
  const conf = computeConfidence({ bullishScore: scores.bullishScore, bearishScore: scores.bearishScore, net: scores.net, signals, expectedSignals: 6, direction: band.direction })

  // 7. Narrative + next steps (deterministic, verdict-consistent).
  const narrative = buildNarrative({ verdictLabel: band.label, direction: band.direction, signals, risk, support, resistance, contributions: scores.contributions, confidence: conf.value })
  const nextSteps = buildNextSteps({ direction: band.direction, verdict: band.verdict, risk })

  const bbSig = signals.find(s => s.key === 'bollinger')
  const labelByKey = Object.fromEntries(signals.map(s => [s.key, s.label]))

  const result = {
    ticker,
    verdict: band.verdict,
    verdictLabel: band.label,
    direction: band.direction,
    confidence: conf.value,
    risk: { level: risk.level, label: risk.label, score: risk.score, reasons: risk.reasons },
    healthScore: health,
    scores: { bullish: scores.bullishScore, bearish: scores.bearishScore, neutral: scores.neutralScore, net: scores.net },
    signals: signals.map(s => ({ key: s.key, label: s.label, category: s.category, group: s.group, direction: s.direction, strength: s.strength, explanation: s.explanation })),
    bollinger: bbSig?.bbDescriptor ?? null,
    narrative,
    nextSteps,
    // Legacy fields so existing consumers keep working (§ back-compat).
    legacyVerdict: band.direction === 'bullish' ? 'BUY' : band.direction === 'bearish' ? 'SELL' : 'HOLD',
    legacyRisk: risk.level === 'LOW' ? 'LOW' : (risk.level === 'MODERATE' || risk.level === 'ELEVATED') ? 'MEDIUM' : 'HIGH',
    summary: narrative.why,
    // Developer-facing breakdown (spec §7/§8): answers "why is this BUY 74%
    // instead of HOLD 55%?" by exposing the signed per-signal points, the
    // direction/agreement/risk scores, and the confidence inputs.
    debug: {
      bullishEvidence: scores.contributions
        .filter(c => c.direction === 'bullish')
        .map(c => ({ signal: labelByKey[c.key] ?? c.key, points: +c.magnitude.toFixed(2) }))
        .sort((a, b) => b.points - a.points),
      bearishEvidence: scores.contributions
        .filter(c => c.direction === 'bearish')
        .map(c => ({ signal: labelByKey[c.key] ?? c.key, points: -Math.abs(+c.magnitude.toFixed(2)) }))
        .sort((a, b) => a.points - b.points),
      netDirectionScore: scores.net,
      riskScore: risk.score,
      agreementScore: conf.breakdown.agreement,
      confidence: conf.value,
      confidenceInputs: conf.breakdown,
      verdict: band.verdict,
      weights: WEIGHTS,
      groupDampen: GROUP_DAMPEN,
      scores: { bullish: scores.bullishScore, bearish: scores.bearishScore, neutral: scores.neutralScore, net: scores.net, totalWeight: scores.totalWeight },
      contributions: scores.contributions,
      thresholds: { verdict: VERDICT_BANDS.map(b => ({ min: b.min, verdict: b.verdict })), risk: RISK_BANDS.map(b => ({ min: b.min, level: b.level })) },
    },
  }

  result.consistency = validate(result)
  return result
}

// ── Suggested next steps (verdict-consistent; max 3, spec §9) ────────────────
// Position-specific steps are added by src/utils/positionContext.js. These are
// the market-level steps that follow purely from the verdict + risk.
function buildNextSteps({ direction, verdict, risk }) {
  const steps = []
  if (direction === 'bullish') {
    steps.push(verdict === 'STRONG_BUY'
      ? 'Evidence broadly agrees to the upside; a pullback toward support is a lower-risk place to engage than chasing strength.'
      : 'The bullish case has the edge; wait for a pullback toward support rather than chasing.')
    steps.push('Track momentum (MACD, RSI) for any early signs of the trend weakening.')
  } else if (direction === 'bearish') {
    steps.push(verdict === 'STRONG_SELL'
      ? 'Evidence broadly agrees to the downside; reducing exposure into strength lowers risk.'
      : 'The bearish case has the edge; consider reducing exposure into any near-term bounce.')
    steps.push('Watch for a reclaim of support/moving averages that would invalidate the bearish read.')
  } else {
    steps.push('Signals are mixed — holding and watching for a decisive break is favored over acting on noise.')
    steps.push('Define the level that, if broken, would tip the evidence bullish or bearish.')
  }
  if (risk.level === 'HIGH' || risk.level === 'EXTREME') {
    steps.push('Elevated risk argues for smaller position sizing regardless of direction.')
  }
  return steps.slice(0, 3)
}
