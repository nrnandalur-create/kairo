// ─────────────────────────────────────────────────────────────────────────────
// Kairo General Multi-Factor Decision Engine
// ─────────────────────────────────────────────────────────────────────────────
// A general, explainable, mathematically-consistent framework that adapts to
// whatever data is available for ANY security. It NEVER hardcodes or tunes for
// a specific ticker. Individual indicators are evidence, never verdicts.
//
// Pipeline (spec §31/§39):
//   validated inputs
//     → normalized SIGNALS  {id, category, direction, strength, reliability, weight}
//     → CATEGORY SCORES     (correlated indicators combined per category, so five
//                            similar signals can't overpower one opposing signal)
//     → DIRECTION score     (category scores × documented category weights)
//     → RISK score, SETUP HEALTH, DATA COMPLETENESS, MARKET REGIME
//     → CONFIDENCE          (agreement × strength × completeness − conflict − uncertainty)
//     → VERDICT             (documented thresholds; Strong ratings are rare)
//     → deterministic natural-language explanation
//
// Missing data is EXCLUDED from the directional math (never zeroed, never treated
// as neutral); it lowers data-completeness and therefore confidence instead.
//
// Pure + dependency-free: identical input → identical output. All math runs at
// full precision; values are rounded only when placed on the output object.

// ── Documented category weights (spec §4) ────────────────────────────────────
// Importance of each evidence category in the DIRECTIONAL decision. Trend and
// technical structure lead (durable structure dominates noise); momentum
// confirms; volume participates; volatility mostly shapes risk (small direction
// weight); fundamentals/relative-strength contribute when their data exists.
// Weights are renormalized over the categories actually present, so an absent
// category is excluded rather than counted as neutral.
export const CATEGORY_WEIGHTS = {
  trend:            0.26,
  momentum:         0.22,
  structure:        0.18,
  volume:           0.10,
  volatility:       0.08, // direction weight is small; volatility mainly drives risk
  fundamentals:     0.10, // only when metrics are available
  relativeStrength: 0.06, // only when a benchmark is available
}

// Importance of each signal WITHIN its category. Correlated members are averaged
// (not summed) inside the category, preventing intra-category double-counting.
const SIGNAL_WEIGHTS = {
  price_vs_sma20: 0.8, price_vs_sma50: 1.0, price_vs_sma200: 1.1, ma_alignment: 1.2, // trend
  macd: 1.2, rsi: 0.9, roc: 0.7,                                                     // momentum
  bollinger: 1.0, atr: 0.6,                                                          // volatility
  volume: 1.0,                                                                       // volume
  sr_proximity: 1.0,                                                                 // structure
  valuation: 1.0,                                                                    // fundamentals
  rs: 1.0,                                                                           // relativeStrength
}

// Verdict thresholds on the net directional score (−100 … +100). Strong ratings
// ALSO require multi-category agreement (see STRONG_MIN_CATEGORIES) so they stay
// rare (spec §22/§23).
const VERDICT_BANDS = [
  { min:  48, verdict: 'STRONG_BUY',   label: 'Strong Buy',    direction: 'bullish' },
  { min:  16, verdict: 'BUY',          label: 'Buy',           direction: 'bullish' },
  { min: -16, verdict: 'HOLD',         label: 'Hold',          direction: 'neutral' },
  { min: -33, verdict: 'REDUCE',       label: 'Trim / Reduce', direction: 'bearish' },
  { min: -58, verdict: 'SELL',         label: 'Sell',          direction: 'bearish' },
  { min: -Infinity, verdict: 'STRONG_SELL', label: 'Strong Sell', direction: 'bearish' },
]
const STRONG_MIN_CATEGORIES = 3 // independent categories that must agree for a Strong rating

// Risk score → label. Thresholds documented (spec §26).
const RISK_BANDS = [
  { min: 80, level: 'EXTREME',  label: 'Extreme Risk'  },
  { min: 62, level: 'HIGH',     label: 'High Risk'     },
  { min: 44, level: 'ELEVATED', label: 'Elevated Risk' },
  { min: 22, level: 'MODERATE', label: 'Moderate Risk' },
  { min: -Infinity, level: 'LOW', label: 'Low Risk'    },
]

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const round = (n) => Math.round(n)
const r1 = (n) => +Number(n).toFixed(1)
const dirVal = (d) => d === 'bullish' ? 1 : d === 'bearish' ? -1 : 0

// ── Bollinger descriptor (spec §13) ──────────────────────────────────────────
// Real % distance relative to the bands — never "111% of the band".
export function describeBollinger(bb, price) {
  if (!bb || price == null) return { zone: 'unknown', text: 'Bollinger Band data unavailable', pctFromEdge: null }
  const { upper, lower } = bb
  const mid = (upper + lower) / 2
  if (price > upper) {
    const pct = ((price - upper) / upper) * 100
    return { zone: 'above_upper', pctFromEdge: r1(pct), text: `Price is ${pct.toFixed(1)}% above the upper Bollinger Band` }
  }
  if (price < lower) {
    const pct = ((lower - price) / lower) * 100
    return { zone: 'below_lower', pctFromEdge: r1(pct), text: `Price is ${pct.toFixed(1)}% below the lower Bollinger Band` }
  }
  const toUpper = (upper - price) / (upper - mid || 1)
  const toLower = (price - lower) / (mid - lower || 1)
  if (toUpper <= 0.15) return { zone: 'near_upper', pctFromEdge: 0, text: 'Price is trading near the upper Bollinger Band' }
  if (toLower <= 0.15) return { zone: 'near_lower', pctFromEdge: 0, text: 'Price is trading near the lower Bollinger Band' }
  return { zone: 'inside', pctFromEdge: 0, text: 'Price is trading inside the Bollinger Bands' }
}

// Bollinger band width as % of price — a compression/expansion gauge.
function bbWidthPct(bb, price) {
  if (!bb || !price) return null
  return r1(((bb.upper - bb.lower) / price) * 100)
}

// ── Signal factory ───────────────────────────────────────────────────────────
function sig(id, category, direction, strength, reliability, explanation, sourceValues = {}) {
  return {
    id, category, direction,
    strength: round(clamp(strength, 0, 100)),
    reliability: round(clamp(reliability, 0, 100)),
    weight: SIGNAL_WEIGHTS[id] ?? 1,
    explanation, sourceValues,
  }
}

// ── A. TREND (spec §12) ──────────────────────────────────────────────────────
// Emits price-vs-each-MA plus an alignment signal. SMA200 is only emitted when
// available (short-history securities are not punished as bearish; their limited
// history lowers confidence via historyFactor instead).
function trendSignals({ price, sma20, sma50, sma200 }) {
  const out = []
  const vsMA = (val, id, label, rel) => {
    if (val == null || price == null) return
    const gap = ((price - val) / val) * 100
    const direction = gap > 0.3 ? 'bullish' : gap < -0.3 ? 'bearish' : 'neutral'
    const strength = clamp(30 + Math.abs(gap) * 4, 20, 92)
    out.push(sig(id, 'trend', direction, strength, rel,
      `Price is ${gap >= 0 ? 'above' : 'below'} its ${label} by ${Math.abs(gap).toFixed(1)}%.`, { value: val, gapPct: r1(gap) }))
  }
  vsMA(sma20, 'price_vs_sma20', '20-day average', 85)
  vsMA(sma50, 'price_vs_sma50', '50-day average', 90)
  vsMA(sma200, 'price_vs_sma200', '200-day average', 95)

  // Alignment: fully stacked MAs are much stronger evidence than price>SMA20.
  const mas = [price, sma20, sma50, sma200].filter(v => v != null)
  if (mas.length >= 3) {
    const bull = (sma20 == null || price >= sma20) && (sma50 == null || (sma20 ?? price) >= sma50) && (sma200 == null || sma50 >= sma200)
    const bear = (sma20 == null || price <= sma20) && (sma50 == null || (sma20 ?? price) <= sma50) && (sma200 == null || sma50 <= sma200)
    const full = sma200 != null
    const direction = bull ? 'bullish' : bear ? 'bearish' : 'neutral'
    const strength = direction === 'neutral' ? 30 : (full ? 82 : 60)
    out.push(sig('ma_alignment', 'trend', direction, strength, full ? 90 : 70,
      direction === 'bullish' ? 'Moving averages are stacked bullishly (shorter above longer).'
      : direction === 'bearish' ? 'Moving averages are stacked bearishly (shorter below longer).'
      : 'Moving averages are not cleanly aligned, so trend structure is mixed.',
      { stacked: direction }))
  }
  return out
}

// ── B. MOMENTUM (spec §10/§11) — regime-aware ────────────────────────────────
function momentumSignals({ macd, rsi, priceChange5d, regime }) {
  const out = []
  // MACD: line vs signal AND histogram behavior vs zero line.
  if (macd && macd.value != null && macd.signal != null) {
    const spread = macd.value - macd.signal
    const rel = macd.price ? Math.abs(spread) / macd.price * 1000 : Math.abs(spread)
    let strength = clamp(38 + rel * 30, 25, 90)
    const above = spread > 0
    const aboveZero = macd.value > 0
    // Histogram shrinking toward the signal line = weakening momentum.
    const weakening = macd.histPrev != null && Math.abs(spread) < Math.abs(macd.histPrev)
    if (weakening) strength = clamp(strength * 0.75, 20, 90)
    const direction = spread > 0 ? 'bullish' : spread < 0 ? 'bearish' : 'neutral'
    out.push(sig('macd', 'momentum', direction, strength, 88,
      `MACD is ${above ? 'above' : 'below'} its signal line${aboveZero ? ' and above the zero line' : ''}${weakening ? ', though the histogram is contracting (momentum easing)' : ''}.`,
      { value: macd.value, signal: macd.signal, weakening }))
  }
  // RSI: interpreted as evidence, modulated by regime (spec §10).
  if (rsi != null) {
    let direction, strength, note
    const trending = regime === 'strong_uptrend' || regime === 'uptrend' || regime === 'strong_downtrend' || regime === 'downtrend'
    if (rsi >= 80) { direction = 'bearish'; strength = clamp(55 + (rsi - 80) * 3, 55, 92); note = 'extreme momentum with elevated reversal risk' }
    else if (rsi >= 70) {
      // In a strong uptrend, 70-80 is momentum, not an automatic reversal.
      direction = 'bearish'
      strength = trending && regime.includes('up') ? clamp(20 + (rsi - 70) * 2, 20, 45) : clamp(42 + (rsi - 70) * 3, 42, 70)
      note = trending && regime.includes('up') ? 'strong momentum with mild overextension' : 'overbought with rising pullback risk'
    }
    else if (rsi <= 20) { direction = 'bullish'; strength = clamp(50 + (20 - rsi) * 3, 50, 90); note = 'deeply oversold — stretched to the downside' }
    else if (rsi <= 30) { direction = 'bullish'; strength = clamp(40 + (30 - rsi) * 2, 40, 65); note = 'oversold, a potential mean-reversion setup' }
    else if (rsi >= 55) { direction = 'bullish'; strength = clamp((rsi - 55) * 2.2, 15, 45); note = 'firm but not stretched momentum' }
    else if (rsi <= 45) { direction = 'bearish'; strength = clamp((45 - rsi) * 2.2, 15, 45); note = 'soft momentum' }
    else { direction = 'neutral'; strength = 18; note = 'a neutral range' }
    out.push(sig('rsi', 'momentum', direction, strength, 85, `RSI at ${rsi.toFixed(0)} reflects ${note}.`, { rsi }))
  }
  // Rate of change (5-day).
  const roc = typeof priceChange5d === 'number' ? priceChange5d
    : (priceChange5d != null && priceChange5d !== 'N/A' ? parseFloat(priceChange5d) : null)
  if (roc != null && !Number.isNaN(roc)) {
    const direction = roc > 1 ? 'bullish' : roc < -1 ? 'bearish' : 'neutral'
    out.push(sig('roc', 'momentum', direction, clamp(28 + Math.abs(roc) * 4, 20, 82), 80,
      `Price is ${roc >= 0 ? 'up' : 'down'} ${Math.abs(roc).toFixed(1)}% over the last 5 sessions.`, { roc: r1(roc) }))
  }
  return out
}

// ── C. VOLATILITY / EXTENSION (spec §13/§15) — regime-aware ──────────────────
function volatilitySignals({ bb, price, atrPct, regime, volumeRatio }) {
  const out = []
  if (bb && price != null) {
    const d = describeBollinger(bb, price)
    const width = bbWidthPct(bb, price)
    const breakout = regime && regime.includes('up') && (volumeRatio ?? 0) >= 1.5
    let direction, strength, explanation
    switch (d.zone) {
      case 'above_upper':
        // Above the band during a strong, high-volume uptrend reads as momentum,
        // not an automatic reversal (spec §9/§13). Otherwise it is overextension.
        if (breakout) { direction = 'bullish'; strength = clamp(30 + d.pctFromEdge * 3, 25, 55); explanation = `${d.text} on strong volume — a momentum breakout rather than an automatic reversal signal.` }
        else { direction = 'bearish'; strength = clamp(42 + d.pctFromEdge * 5, 42, 85); explanation = `${d.text}, indicating short-term overextension and increased pullback risk.` }
        break
      case 'near_upper': direction = breakout ? 'bullish' : 'bearish'; strength = 32; explanation = `${d.text}.`; break
      case 'below_lower': direction = 'bullish'; strength = clamp(42 + d.pctFromEdge * 5, 42, 85); explanation = `${d.text}, a stretched downside move / potential mean-reversion setup.`; break
      case 'near_lower': direction = 'bullish'; strength = 32; explanation = `${d.text}.`; break
      default: direction = 'neutral'; strength = 15; explanation = `${d.text}.`
    }
    // A breakout out of a low-volatility squeeze carries more weight.
    if (width != null && width < 6 && (d.zone === 'above_upper' || d.zone === 'below_lower')) strength = clamp(strength + 10, 0, 90)
    out.push(sig('bollinger', 'volatility', direction, strength, 82, explanation, { zone: d.zone, pctFromEdge: d.pctFromEdge, widthPct: width, bbDescriptor: d }))
  }
  // ATR carries no direction of its own — it feeds risk. Emitted (neutral) so it
  // counts toward data completeness for the volatility category.
  if (atrPct != null) {
    out.push(sig('atr', 'volatility', 'neutral', clamp(atrPct * 6, 10, 90), 80,
      `Average True Range is ${atrPct.toFixed(1)}% of price.`, { atrPct: r1(atrPct) }))
  }
  return out
}

// ── D. VOLUME (spec §14) ─────────────────────────────────────────────────────
function volumeSignals({ volume, priceChange5d }) {
  if (!volume || volume.ratio == null) return []
  const ratio = volume.ratio
  const roc = typeof priceChange5d === 'number' ? priceChange5d : parseFloat(priceChange5d)
  const moveDir = !Number.isFinite(roc) || Math.abs(roc) < 1 ? 'neutral' : roc > 0 ? 'bullish' : 'bearish'
  // Graduated participation bands.
  const tier = ratio < 0.7 ? 'low' : ratio < 1.2 ? 'normal' : ratio < 1.5 ? 'moderate' : ratio < 2 ? 'strong' : 'very high'
  if (moveDir === 'neutral' || tier === 'low' || tier === 'normal') {
    return [sig('volume', 'volume', 'neutral', tier === 'very high' || tier === 'strong' ? 30 : 15, 80,
      `Volume is ${ratio.toFixed(1)}× its 20-day average (${tier}); with a directionless move it adds little confirmation.`, { ratio, tier })]
  }
  const strength = clamp(25 + (ratio - 1) * 40, 25, 80)
  return [sig('volume', 'volume', moveDir, strength, 80,
    `Volume is ${ratio.toFixed(1)}× its 20-day average (${tier}), ${moveDir === 'bullish' ? 'confirming buying interest behind the advance' : 'confirming selling pressure behind the decline'}.`, { ratio, tier })]
}

// ── E. STRUCTURE — support/resistance proximity (spec §16/§17) ───────────────
function structureSignals({ support, resistance, price }) {
  if (price == null) return []
  const nearSup = normLevel(pickNearest(support, price, 'support'))
  const nearRes = normLevel(pickNearest(resistance, price, 'resistance'))
  if (!nearSup && !nearRes) return []
  const dSup = nearSup ? Math.abs(price - nearSup.price) / price * 100 : Infinity
  const dRes = nearRes ? Math.abs(nearRes.price - price) / price * 100 : Infinity
  let direction, strength, explanation, src
  if (dSup <= dRes && dSup <= 4) {
    direction = 'bullish'; strength = clamp(55 - dSup * 8, 25, 70)
    explanation = `Price is holding just above ${nearSup.source} near ${fmt(nearSup.price)}, giving the setup nearby footing.`
    src = { level: nearSup }
  } else if (dRes < dSup && dRes <= 3) {
    direction = 'bearish'; strength = clamp(55 - dRes * 10, 25, 70)
    explanation = `Price is pressing into ${nearRes.source} near ${fmt(nearRes.price)}, where overhead supply can cap advances.`
    src = { level: nearRes }
  } else {
    direction = 'neutral'; strength = 22
    explanation = 'Price is between its nearest calculated support and resistance, so structure is neutral.'
    src = { nearestSupport: nearSup, nearestResistance: nearRes }
  }
  return [sig('sr_proximity', 'structure', direction, strength, 78, explanation, src)]
}

// ── F. FUNDAMENTALS (spec §18) — contextual, optional ────────────────────────
// Only emitted when valuation + growth are both present. Growth-justified
// valuation is bullish; expensive + slow is bearish. Missing/inappropriate
// metrics are simply not emitted (not punished).
function fundamentalSignals({ pe, epsGrowth5Y }) {
  if (pe == null || pe <= 0 || epsGrowth5Y == null) return []
  // PEG-style: fair P/E scales with growth. Cheap-vs-growth → bullish tilt.
  const g = clamp(epsGrowth5Y, -20, 60)
  const fairPE = clamp(10 + g * 0.9, 8, 55)
  const rel = (pe - fairPE) / fairPE // <0 cheap vs growth, >0 expensive
  const direction = rel < -0.2 ? 'bullish' : rel > 0.3 ? 'bearish' : 'neutral'
  const strength = clamp(Math.abs(rel) * 70, 15, 65)
  const explanation = direction === 'bullish'
    ? `Valuation looks reasonable for the growth: P/E ${pe.toFixed(0)} against ~${g.toFixed(0)}% 5-yr EPS growth.`
    : direction === 'bearish'
    ? `Valuation is rich relative to growth: P/E ${pe.toFixed(0)} against ~${g.toFixed(0)}% 5-yr EPS growth.`
    : `Valuation is roughly in line with growth (P/E ${pe.toFixed(0)}, ~${g.toFixed(0)}% growth).`
  return [sig('valuation', 'fundamentals', direction, strength, 65, explanation, { pe, epsGrowth5Y, fairPE: r1(fairPE) })]
}

// ── G. RELATIVE STRENGTH (spec §1G) — optional ───────────────────────────────
function relativeStrengthSignals({ stockChange, benchChange }) {
  if (stockChange == null || benchChange == null) return []
  const diff = stockChange - benchChange
  const direction = diff > 0.5 ? 'bullish' : diff < -0.5 ? 'bearish' : 'neutral'
  return [sig('rs', 'relativeStrength', direction, clamp(30 + Math.abs(diff) * 5, 20, 80), 75,
    `The stock is ${diff >= 0 ? 'outperforming' : 'lagging'} its benchmark by ${Math.abs(diff).toFixed(1)}% recently.`, { stockChange, benchChange })]
}

// ── Category scoring (spec §3) ───────────────────────────────────────────────
// Combine correlated signals into ONE score per category via a
// reliability-weighted average of signed strength — so members that measure the
// same behavior can't sum into an outsized vote.
function categoryScore(signals) {
  let num = 0, den = 0
  for (const s of signals) {
    const w = s.weight * (s.reliability / 100)
    num += dirVal(s.direction) * s.strength * w
    den += w
  }
  return den ? clamp(num / den, -100, 100) : null
}

// ── Market regime (spec §9) ──────────────────────────────────────────────────
// Approximate, from trend structure + volatility. Used to modulate RSI/Bollinger
// interpretation (already applied above) and to add confidence uncertainty in
// range/high-volatility conditions.
function classifyRegime({ trendCat, atrPct, bbWidth }) {
  const highVol = (atrPct != null && atrPct > 4) || (bbWidth != null && bbWidth > 18)
  let label
  if (trendCat == null) label = 'range'
  else if (trendCat >= 45) label = 'strong_uptrend'
  else if (trendCat >= 15) label = 'uptrend'
  else if (trendCat <= -45) label = 'strong_downtrend'
  else if (trendCat <= -15) label = 'downtrend'
  else label = 'range'
  return { label, highVol }
}

// ── Data completeness (spec §7/§27) — context-aware ──────────────────────────
// Expected = the technical signals that SHOULD exist for this security given its
// history + whichever optional inputs were provided. Metrics that are
// inappropriate (e.g. P/E for an ETF) are NOT expected, so their absence does
// not lower completeness. Limited history (no SMA200) is handled separately by
// historyFactor so it lowers confidence without mislabeling the security.
function computeCompleteness({ availableIds, hasSma200Expected, hasFundamentals, hasBenchmark }) {
  const expected = ['price_vs_sma20', 'price_vs_sma50', 'ma_alignment', 'macd', 'rsi', 'roc', 'bollinger', 'atr', 'volume', 'sr_proximity']
  if (hasSma200Expected) expected.push('price_vs_sma200')
  if (hasFundamentals)   expected.push('valuation')
  if (hasBenchmark)      expected.push('rs')
  const have = expected.filter(id => availableIds.includes(id)).length
  return { score: +(have / expected.length).toFixed(2), expected, have }
}

// ── Risk (spec §26) — independent of direction ───────────────────────────────
function computeRisk({ signals, bb, price, atrPct, beta, historyFactor, priceChange5d, hi52, lo52, net, bull, bear, completeness, regime, volumeRatio }) {
  let risk = 18
  const reasons = []
  // Volatility: ATR% preferred, Bollinger width as fallback.
  if (atrPct != null) {
    if (atrPct > 6) { risk += 26; reasons.push(`high volatility (ATR ${atrPct.toFixed(1)}% of price)`) }
    else if (atrPct > 4) { risk += 16; reasons.push(`above-average volatility (ATR ${atrPct.toFixed(1)}%)`) }
    else if (atrPct > 2.5) { risk += 8 }
    else if (atrPct < 1.5) { risk -= 4 }
  } else if (bb && price) {
    const w = bbWidthPct(bb, price)
    if (w > 18) { risk += 22; reasons.push('wide Bollinger bands signal elevated volatility') }
    else if (w > 12) { risk += 12 }
    else if (w < 6) { risk -= 5 }
  }
  // Extension beyond a band, scaled by magnitude (extreme readings matter more).
  const bbS = signals.find(s => s.id === 'bollinger')
  const zone = bbS?.sourceValues?.zone
  if (zone === 'above_upper' || zone === 'below_lower') {
    const over = bbS.sourceValues.pctFromEdge ?? 0
    risk += clamp(10 + over * 2.5, 10, 30)
    if (over >= 5) reasons.push(`price is ${over}% beyond a Bollinger Band (significant short-term overextension)`)
    // An extension that volume does NOT confirm is more prone to reversal than a
    // volume-backed breakout (spec §13/§14).
    if (volumeRatio != null && volumeRatio < 1.0) { risk += 8; reasons.push('the extension is not confirmed by volume') }
  }
  // Sharp recent move.
  const roc = typeof priceChange5d === 'number' ? priceChange5d : parseFloat(priceChange5d)
  if (Number.isFinite(roc) && Math.abs(roc) > 12) { risk += 12; reasons.push('a large recent price swing') }
  else if (Number.isFinite(roc) && Math.abs(roc) > 8) { risk += 6 }
  // Conflicting evidence (whipsaw risk).
  const conflict = Math.min(bull, bear)
  if (conflict > 25) { risk += 14; reasons.push('bullish and bearish evidence are in conflict') }
  else if (conflict > 15) { risk += 7 }
  // Structural downside proximity.
  if (lo52 && price) { const a = ((price - lo52) / lo52) * 100; if (a < 8 && net < 0) { risk += 12; reasons.push('price is near its 52-week low while evidence leans bearish') } }
  if (hi52 && price) { const b = ((hi52 - price) / hi52) * 100; if (b < 3 && net > 0) { risk += 6; reasons.push('price is extended near its 52-week high') } }
  // Beta only when it is reliable (enough history).
  if (beta != null && historyFactor >= 0.9 && beta > 1.6) { risk += 6; reasons.push(`a high beta (${beta.toFixed(1)})`) }
  // Data uncertainty raises risk.
  if (completeness < 0.6) { risk += 8; reasons.push('incomplete evidence') }
  if (regime.label === 'range' && regime.highVol) { risk += 8; reasons.push('a choppy, high-volatility regime') }

  const score = clamp(round(risk), 0, 100)
  return { score, ...RISK_BANDS.find(b => score >= b.min), reasons }
}

// ── Setup health (spec §25) — quality of the setup, distinct from confidence ─
function computeHealth({ categories, net, riskScore, neutralWeightFrac, completeness }) {
  let h = 50
  h += (categories.trend ?? 0) * 0.22
  h += (categories.momentum ?? 0) * 0.14
  h += (categories.structure ?? 0) * 0.08
  h += (net / 100) * 10
  h -= (riskScore / 100) * 22
  h -= neutralWeightFrac * 8
  h -= (1 - completeness) * 10
  return clamp(round(h), 0, 100)
}

// ── Confidence (spec §6/§24) ─────────────────────────────────────────────────
// Confidence that the AVAILABLE EVIDENCE supports the classification — NOT a
// probability that price rises. Driven by category agreement, evidence strength,
// data completeness, and independent-category count; reduced by conflict and by
// regime/history uncertainty.
function computeConfidence({ direction, net, bull, bear, categories, presentCats, agreeingCats, completeness, historyFactor, regime }) {
  const total = bull + bear
  const agreement = total > 0 ? Math.abs(net) / total : 0
  const alignedScores = Object.values(categories).filter(v => v != null && (direction === 'neutral' || Math.sign(v) === Math.sign(net)))
  const evidenceStrength = alignedScores.length ? alignedScores.reduce((s, v) => s + Math.abs(v), 0) / alignedScores.length : 30
  const conflictFrac = total > 0 ? Math.min(bull, bear) / total : 0

  const uncertainty =
      (regime.label === 'range' ? 0.05 : 0)
    + (regime.highVol ? 0.03 : 0)
    + (completeness < 0.6 ? 0.06 : 0)
    + (agreeingCats < 3 ? 0.05 : 0)
    + ((1 - historyFactor) * 0.15)
    + (presentCats < 4 ? 0.05 : 0)

  if (direction === 'neutral') {
    // Genuinely balanced/conflicted — a mid band. 50 means "evenly matched", not "bad".
    let c = 55 - conflictFrac * 20 - uncertainty * 60
    return { value: round(clamp(c, 42, 62)), breakdown: mkBreak(agreement, evidenceStrength, completeness, conflictFrac, uncertainty) }
  }
  let base = 100 * (0.50 * agreement + 0.30 * (evidenceStrength / 100) + 0.20 * completeness)
  base -= 100 * (conflictFrac * 0.5)
  base -= 100 * uncertainty
  // Agreement ceiling: high confidence requires genuine consensus.
  base = Math.min(base, 55 + agreement * 40)
  return { value: round(clamp(base, 40, 95)), breakdown: mkBreak(agreement, evidenceStrength, completeness, conflictFrac, uncertainty) }
}
function mkBreak(agreement, strength, completeness, conflictFrac, uncertainty) {
  return {
    signalAgreement: +agreement.toFixed(2),
    evidenceStrength: round(strength),
    dataCompleteness: +completeness.toFixed(2),
    conflictPenalty: round(conflictFrac * 50),
    uncertaintyPenalty: round(uncertainty * 100),
  }
}

// ── Natural-language (deterministic; comes AFTER scoring, spec §31/§32) ───────
const PHRASES = {
  price_vs_sma20:  { bullish: 'price is holding above its short-term average',   bearish: 'price is below its short-term average',    neutral: 'price is near its short-term average' },
  price_vs_sma50:  { bullish: 'price is above its medium-term average',          bearish: 'price is below its medium-term average',   neutral: 'price is near its medium-term average' },
  price_vs_sma200: { bullish: 'price is above its long-term average',            bearish: 'price is below its long-term average',     neutral: 'price is near its long-term average' },
  ma_alignment:    { bullish: 'the moving averages are stacked bullishly',       bearish: 'the moving averages are stacked bearishly', neutral: 'the moving averages are mixed' },
  macd:            { bullish: 'MACD is holding bullish',                         bearish: 'MACD has turned bearish',                  neutral: 'MACD is flat' },
  rsi:             { bullish: 'RSI shows constructive momentum',                 bearish: 'RSI is stretched',                         neutral: 'RSI is neutral' },
  roc:             { bullish: 'recent momentum is positive',                     bearish: 'recent momentum is negative',              neutral: 'recent momentum is flat' },
  bollinger:       { bullish: 'price is stretched below the lower Bollinger Band', bearish: 'price is extended above the upper Bollinger Band', neutral: 'price sits inside the Bollinger Bands' },
  volume:          { bullish: 'volume is confirming the advance',                bearish: 'volume is confirming the decline',         neutral: 'volume is unremarkable' },
  sr_proximity:    { bullish: 'price is holding above nearby support',           bearish: 'price is pressing into overhead resistance', neutral: 'price is between support and resistance' },
  valuation:       { bullish: 'valuation is reasonable for the growth',          bearish: 'valuation is rich versus growth',          neutral: 'valuation is roughly fair' },
  rs:              { bullish: 'the stock is outperforming its benchmark',        bearish: 'the stock is lagging its benchmark',       neutral: 'the stock is tracking its benchmark' },
}
const phraseFor = (s) => PHRASES[s.id]?.[s.direction] ?? s.explanation
function joinClauses(arr) {
  if (!arr.length) return ''
  if (arr.length === 1) return arr[0]
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`
}
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
function normLevel(l) {
  if (l == null) return null
  if (typeof l === 'number') return { price: l, type: null, source: 'a recent swing level' }
  return { price: l.price, type: l.type ?? null, source: l.source ?? 'a recent level', strength: l.strength, touches: l.touches }
}
function pickNearest(levels, price, type) {
  if (!Array.isArray(levels) || !levels.length) return null
  const norm = levels.map(normLevel).filter(Boolean)
  const side = type === 'support' ? norm.filter(l => l.price <= price) : norm.filter(l => l.price >= price)
  const pool = side.length ? side : norm
  return pool.sort((a, b) => Math.abs(price - a.price) - Math.abs(price - b.price))[0]
}
function fmt(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}` }

function buildNarrative({ verdictLabel, direction, signals, risk, support, resistance, contributions, confidence, scope }) {
  const impact = Object.fromEntries((contributions ?? []).map(c => [c.id, c.magnitude]))
  const rank = d => signals.filter(s => s.direction === d).sort((a, b) => (impact[b.id] ?? b.strength) - (impact[a.id] ?? a.strength))
  // De-duplicate by category so the WHY doesn't repeat three trend clauses.
  const dedupeByCategory = list => { const seen = new Set(); return list.filter(s => (seen.has(s.category) ? false : (seen.add(s.category), true))) }
  const topBull = dedupeByCategory(rank('bullish')).slice(0, 3)
  const topBear = dedupeByCategory(rank('bearish')).slice(0, 3)
  const bullClause = joinClauses(topBull.map(phraseFor))
  const bearClause = joinClauses(topBear.map(phraseFor))
  const scopeWord = scope === 'technical' ? 'Technical' : 'Overall'

  let why
  if (direction === 'bullish') {
    const lead = bullClause ? `${cap(bullClause)}.` : 'The bullish factors are modest.'
    const off  = bearClause ? ` However, ${bearClause}, which increases near-term risk.` : ''
    why = `${lead}${off} On balance the bullish evidence outweighs the bearish, producing a ${scopeWord.toLowerCase()} ${verdictLabel} rating at ${confidence}% confidence.`
  } else if (direction === 'bearish') {
    const lead = bearClause ? `${cap(bearClause)}.` : 'The bearish factors are modest.'
    const off  = bullClause ? ` The main offset is that ${bullClause}.` : ''
    why = `${lead}${off} On balance the bearish evidence outweighs the bullish, producing a ${scopeWord.toLowerCase()} ${verdictLabel} rating at ${confidence}% confidence.`
  } else {
    why = `Bullish evidence (${bullClause || 'limited'}) is closely matched by bearish evidence (${bearClause || 'limited'}), producing a ${verdictLabel} at ${confidence}% confidence — the signals conflict rather than align.`
  }

  const primaryRisk = risk.reasons.length
    ? `The main risk to this setup is ${risk.reasons[0]}${risk.reasons[1] ? `, compounded by ${risk.reasons[1]}` : ''}. This raises the probability of an adverse move against the position.`
    : 'No single dominant risk stands out, but no setup is without downside — size accordingly.'

  const nearSupport = pickNearest(support, priceFromSignals(signals), 'support')
  const nearRes     = pickNearest(resistance, priceFromSignals(signals), 'resistance')
  const hasMacd  = signals.some(s => s.id === 'macd')
  const hasTrend = signals.some(s => s.category === 'trend')
  const bbBearish = signals.some(s => s.id === 'bollinger' && s.direction === 'bearish')

  const moreBullishIf = []
  if (nearRes) moreBullishIf.push(`Price closes above ${nearRes.source} near ${fmt(nearRes.price)}`)
  else if (nearSupport) moreBullishIf.push(`Price holds above ${nearSupport.source} near ${fmt(nearSupport.price)}`)
  if (hasMacd) moreBullishIf.push('MACD momentum strengthens (histogram expands above the signal line)')
  moreBullishIf.push(bbBearish ? 'Bollinger overextension cools without the trend breaking down' : 'Trend structure improves as price extends above its moving averages')

  const moreBearishIf = []
  if (nearSupport) moreBearishIf.push(`A close below ${nearSupport.source} near ${fmt(nearSupport.price)}`)
  else moreBearishIf.push('A close below the nearest calculated support level')
  if (hasMacd) moreBearishIf.push('MACD crosses below its signal line')
  if (hasTrend) moreBearishIf.push('Trend structure deteriorates as price loses its 50-day average')

  return { why, primaryRisk, whatWouldChange: { moreBullishIf: moreBullishIf.slice(0, 3), moreBearishIf: moreBearishIf.slice(0, 3) } }
}
function priceFromSignals(signals) {
  const t = signals.find(s => s.sourceValues && s.sourceValues.value != null && s.category === 'trend')
  return t ? t.sourceValues.value : null // only used to order levels; nearest logic tolerates null
}

// ── Consistency validation (spec §29/§34) ────────────────────────────────────
const BANNED = [/\bforces? (a )?(sell|buy)\b/i, /\bwill (rally|pull ?back|crash|soar|go up|drop)\b/i, /\bguaranteed\b/i, /\bmust (buy|sell)\b/i]
function validate(result, inputs) {
  const issues = []
  const { direction, scores } = result
  if (direction === 'bullish' && scores.net < 0) issues.push('verdict is bullish but net score is negative')
  if (direction === 'bearish' && scores.net > 0) issues.push('verdict is bearish but net score is positive')
  const wtc = result.narrative.whatWouldChange
  const texts = [result.narrative.why, result.narrative.primaryRisk, ...(wtc?.moreBullishIf ?? []), ...(wtc?.moreBearishIf ?? []), ...(result.nextSteps || [])]
  for (const t of texts) for (const re of BANNED) if (re.test(t)) issues.push(`banned phrase in copy: "${t}"`)
  if (result.verdict === 'HOLD' && Math.abs(scores.net) > 18) issues.push('HOLD emitted with a decisive net score')
  // Bollinger position sanity: recompute from bands and flag if it disagrees
  // with the supplied pct beyond rounding tolerance (spec §29/§30).
  const bb = inputs.bb
  if (bb && inputs.price != null && bb.pct != null && bb.upper != null && bb.lower != null && bb.upper !== bb.lower) {
    const recomputed = ((inputs.price - bb.lower) / (bb.upper - bb.lower)) * 100
    if (Math.abs(recomputed - bb.pct) > 2) issues.push(`Bollinger position mismatch: displayed ${bb.pct}% vs computed ${recomputed.toFixed(1)}%`)
  }
  return { ok: issues.length === 0, issues }
}

// ── Public API ───────────────────────────────────────────────────────────────
export function buildDecision(input = {}) {
  const {
    ticker = null, price = null,
    rsi = null, macd = null, bb = null,
    sma20 = null, sma50 = null, sma200 = null,
    volume = null, priceChange5d = null, atrPct = null,
    hi52 = null, lo52 = null, beta = null,
    pe = null, epsGrowth5Y = null,
    stockChange = null, benchChange = null,
    support = [], resistance = [],
    historyLen = null,
    asOf = null,
    noTechnicals = false,
  } = input

  const coreCount = [rsi, macd, bb].filter(v => v != null).length
  if (noTechnicals || coreCount === 0) {
    return { unavailable: true, reason: 'insufficient technical data', availableTechnicals: coreCount }
  }

  // Limited history lowers confidence (spec §14) without mislabeling the security.
  const historyFactor = historyLen != null ? clamp(historyLen / 200, 0.5, 1) : 0.85

  // 1. Trend first (needed to classify the regime that modulates momentum/vol).
  const trend = trendSignals({ price, sma20, sma50, sma200 })
  const trendCatPre = categoryScore(trend)
  const width = bbWidthPct(bb, price)
  const regime = classifyRegime({ trendCat: trendCatPre, atrPct, bbWidth: width })

  // 2. Remaining categories (regime-aware where relevant).
  const signals = [
    ...trend,
    ...momentumSignals({ macd: macd ? { ...macd, price } : null, rsi, priceChange5d, regime: regime.label }),
    ...volatilitySignals({ bb, price, atrPct, regime: regime.label, volumeRatio: volume?.ratio }),
    ...volumeSignals({ volume, priceChange5d }),
    ...structureSignals({ support, resistance, price }),
    ...fundamentalSignals({ pe, epsGrowth5Y }),
    ...relativeStrengthSignals({ stockChange, benchChange }),
  ]

  // 3. Category scores (correlated signals combined per category).
  const byCat = {}
  for (const s of signals) (byCat[s.category] ||= []).push(s)
  const categories = {}
  for (const [cat, list] of Object.entries(byCat)) categories[cat] = categoryScore(list)

  // 4. Combine category scores with renormalized weights → net direction.
  const presentCats = Object.entries(categories).filter(([, v]) => v != null)
  const wSum = presentCats.reduce((s, [cat]) => s + (CATEGORY_WEIGHTS[cat] ?? 0), 0) || 1
  let bull = 0, bear = 0, neutralWeight = 0
  const contributions = []
  for (const [cat, score] of presentCats) {
    const w = (CATEGORY_WEIGHTS[cat] ?? 0) / wSum
    const c = score * w // −100..100 scaled
    if (c > 0) bull += c; else if (c < 0) bear += -c; else neutralWeight += w
    contributions.push({ category: cat, score: r1(score), weight: +w.toFixed(3), contribution: r1(c) })
  }
  const net = r1(bull - bear)
  bull = r1(bull); bear = r1(bear)

  // Per-signal impact (for the WHY): |signed strength| × category weight share.
  const sigContribs = signals.map(s => {
    const catW = (CATEGORY_WEIGHTS[s.category] ?? 0) / wSum
    return { id: s.id, category: s.category, direction: s.direction, magnitude: +((s.strength / 100) * (s.weight) * catW).toFixed(3) }
  })

  // 5. Verdict from net; Strong ratings require multi-category agreement (§23).
  let band = VERDICT_BANDS.find(b => net >= b.min)
  const agreeingCats = presentCats.filter(([, v]) => band.direction !== 'neutral' && Math.sign(v) === (band.direction === 'bullish' ? 1 : -1) && Math.abs(v) >= 20).length
  const completeness = computeCompleteness({
    availableIds: signals.map(s => s.id),
    hasSma200Expected: sma200 != null || (historyLen != null && historyLen >= 200),
    hasFundamentals: pe != null && epsGrowth5Y != null,
    hasBenchmark: benchChange != null,
  }).score
  if ((band.verdict === 'STRONG_BUY' || band.verdict === 'STRONG_SELL') && (agreeingCats < STRONG_MIN_CATEGORIES || completeness < 0.6)) {
    band = VERDICT_BANDS.find(b => b.verdict === (band.verdict === 'STRONG_BUY' ? 'BUY' : 'SELL'))
  }

  // 6. Risk, health, confidence.
  const risk = computeRisk({ signals, bb, price, atrPct, beta, historyFactor, priceChange5d, hi52, lo52, net, bull, bear, completeness, regime, volumeRatio: volume?.ratio })
  const neutralWeightFrac = clamp(neutralWeight, 0, 1)
  const health = computeHealth({ categories, net, riskScore: risk.score, neutralWeightFrac, completeness })
  const conf = computeConfidence({ direction: band.direction, net, bull, bear, categories, presentCats: presentCats.length, agreeingCats, completeness, historyFactor, regime })

  const scope = (pe != null && epsGrowth5Y != null) ? 'overall' : 'technical'

  // 7. Narrative (LLM-free; explains the already-computed result).
  const narrative = buildNarrative({ verdictLabel: band.label, direction: band.direction, signals, risk, support, resistance, contributions: sigContribs, confidence: conf.value, scope })
  const nextSteps = buildNextSteps({ direction: band.direction, verdict: band.verdict, risk })

  const bbS = signals.find(s => s.id === 'bollinger')

  const result = {
    ticker,
    scope, // 'technical' | 'overall' (spec §19)
    verdict: band.verdict,
    verdictLabel: band.label,
    direction: band.direction,
    confidence: conf.value,
    risk: { level: risk.level, label: risk.label, score: risk.score, reasons: risk.reasons },
    healthScore: health,
    regime: regime.label,
    dataCompleteness: completeness,
    scores: { bullish: bull, bearish: bear, neutral: r1(neutralWeightFrac * 100), net },
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v == null ? null : r1(v)])),
    signals: signals.map(s => ({ id: s.id, key: s.id, label: labelFor(s.id), category: s.category, direction: s.direction, strength: s.strength, reliability: s.reliability, explanation: s.explanation })),
    bollinger: bbS?.sourceValues?.bbDescriptor ?? null,
    narrative,
    nextSteps,
    // Legacy fields so existing consumers keep working.
    legacyVerdict: band.direction === 'bullish' ? 'BUY' : band.direction === 'bearish' ? 'SELL' : 'HOLD',
    legacyRisk: risk.level === 'LOW' ? 'LOW' : (risk.level === 'MODERATE' || risk.level === 'ELEVATED') ? 'MEDIUM' : 'HIGH',
    summary: narrative.why,
    asOf,
    debug: {
      data: { completeness, historyFactor: +historyFactor.toFixed(2), regime: regime.label, highVol: regime.highVol, asOf },
      categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v == null ? null : r1(v)])),
      categoryContributions: contributions,
      evidence: { bullish: bull, bearish: bear, neutralWeightPct: r1(neutralWeightFrac * 100) },
      bullishEvidence: sigContribs.filter(c => c.direction === 'bullish').map(c => ({ signal: labelFor(c.id), category: c.category, points: c.magnitude })).sort((a, b) => b.points - a.points),
      bearishEvidence: sigContribs.filter(c => c.direction === 'bearish').map(c => ({ signal: labelFor(c.id), category: c.category, points: -c.magnitude })).sort((a, b) => a.points - b.points),
      netDirectionScore: net,
      riskScore: risk.score,
      setupHealth: health,
      agreeingCategories: agreeingCats,
      confidence: { score: conf.value, ...conf.breakdown },
      verdict: { direction: band.direction, rating: band.verdict, scope },
      weights: CATEGORY_WEIGHTS,
      thresholds: { verdict: VERDICT_BANDS.map(b => ({ min: b.min, verdict: b.verdict })), risk: RISK_BANDS.map(b => ({ min: b.min, level: b.level })) },
    },
  }
  result.consistency = validate(result, { bb, price })
  return result
}

function labelFor(id) {
  return {
    price_vs_sma20: 'Price vs SMA20', price_vs_sma50: 'Price vs SMA50', price_vs_sma200: 'Price vs SMA200',
    ma_alignment: 'MA Alignment', macd: 'MACD', rsi: 'RSI (14)', roc: 'Momentum (5d)',
    bollinger: 'Bollinger', atr: 'ATR', volume: 'Volume', sr_proximity: 'Support/Resistance',
    valuation: 'Valuation', rs: 'Relative Strength',
  }[id] ?? id
}

// ── Suggested next steps (verdict-consistent; max 3) ─────────────────────────
function buildNextSteps({ direction, verdict, risk }) {
  const steps = []
  if (direction === 'bullish') {
    steps.push(verdict === 'STRONG_BUY'
      ? 'Evidence broadly agrees to the upside; a pullback toward support is a lower-risk place to engage than chasing strength.'
      : 'The bullish case has the edge; a pullback toward support is a lower-risk entry than chasing.')
    steps.push('Track momentum (MACD, RSI) for early signs of the trend weakening.')
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
