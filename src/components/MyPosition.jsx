import { useEffect, useMemo, useState } from 'react'
import InfoTooltip from './InfoTooltip'
import { fetchLatestConviction, saveConviction } from '../services/convictionLog'
import { toast } from '../utils/toast'

// Per-ticker position state is stored locally so users see their numbers
// the next time they pull up the same ticker on this device. Mirrors the
// chat-history storage pattern (kairo_chat_*).
const STORAGE_PREFIX = 'kairo_position_'

function loadPosition(ticker) {
  if (!ticker || typeof window === 'undefined') return { costBasis: '', shares: '', costMode: 'avg' }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + ticker)
    if (!raw) return { costBasis: '', shares: '', costMode: 'avg' }
    const v = JSON.parse(raw)
    return {
      costBasis: v.costBasis != null ? String(v.costBasis) : '',
      shares:    v.shares    != null ? String(v.shares)    : '',
      costMode:  v.costMode === 'total' ? 'total' : 'avg',
    }
  } catch {
    return { costBasis: '', shares: '', costMode: 'avg' }
  }
}

function savePosition(ticker, { costBasis, shares, costMode }) {
  if (!ticker || typeof window === 'undefined') return
  try {
    if (!costBasis && !shares) {
      localStorage.removeItem(STORAGE_PREFIX + ticker)
      return
    }
    localStorage.setItem(STORAGE_PREFIX + ticker, JSON.stringify({ costBasis, shares, costMode }))
  } catch { /* private mode etc */ }
}

const fmtMoney = (n, { sign = false } = {}) => {
  if (n == null || isNaN(n)) return '—'
  const s = (sign && n > 0 ? '+' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `-${s.replace('-', '')}` : s
}
const fmtPct = (n) => {
  if (n == null || isNaN(n)) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

// ──────────────────────────────────────────────────────────────────────────────
// Derive a personalized verdict from the existing AI verdict + the user's
// unrealized gain on this position. The base AI signal (BUY / HOLD / SELL)
// is augmented by where the user is relative to break-even — a "BUY" stock
// can still be "take profits" for someone up 35%, and a "SELL" stock can
// still be "hold to cut loss" for someone deep underwater.
function derivePersonalRec({ aiVerdict, gainPct, riskLevel }) {
  const v = (aiVerdict ?? 'HOLD').toUpperCase()
  const g = gainPct ?? 0
  const r = (riskLevel ?? 'MEDIUM').toUpperCase()

  if (v === 'BUY') {
    if (g > 30) return { label: 'Take Partial Profits', tone: 'amber', glyph: '◐' }
    if (g > 10) return { label: 'Hold & Let It Run',    tone: 'green', glyph: '▲' }
    if (g < -10) return { label: 'Average Down Carefully', tone: 'amber', glyph: '↓' }
    return { label: 'Buy More', tone: 'green', glyph: '+' }
  }
  if (v === 'SELL') {
    if (g > 5)  return { label: 'Take Profits Now', tone: 'red', glyph: '▼' }
    if (g < -15) return { label: 'Cut Losses',     tone: 'red', glyph: '▼' }
    return { label: 'Reduce Exposure', tone: 'red', glyph: '▼' }
  }
  // HOLD / unknown
  if (g > 20) return { label: 'Consider Taking Profits', tone: 'amber', glyph: '◐' }
  if (g < -15) return { label: 'Hold & Watch Closely', tone: 'amber', glyph: '◐' }
  if (r === 'HIGH') return { label: 'Hold & Reduce Risk', tone: 'amber', glyph: '◐' }
  return { label: 'Hold', tone: 'neutral', glyph: '─' }
}

// 0-100 composite score. Anchored at 50 for a typical position; shifts
// positively for confluence (BUY + winning trade + low risk) and negatively
// for divergence (SELL + losing trade + high risk).
function deriveHealthScore({ aiVerdict, aiConfidence, riskLevel, gainPct }) {
  let score = 50
  const v = (aiVerdict ?? 'HOLD').toUpperCase()
  const conf = Number.isFinite(aiConfidence) ? aiConfidence : 60

  if (v === 'BUY')  score += conf * 0.30      // up to +30
  if (v === 'SELL') score -= conf * 0.30      // down to -30

  // Gain shift: linearly within ±20% range, capped at ±15 points.
  const g = Math.max(-20, Math.min(20, gainPct ?? 0))
  score += (g / 20) * 15

  // Risk adjustment.
  const r = (riskLevel ?? 'MEDIUM').toUpperCase()
  if (r === 'LOW')  score += 5
  if (r === 'HIGH') score -= 12

  return Math.round(Math.max(0, Math.min(100, score)))
}

function riskLabel({ aiRisk, gainPct, healthScore }) {
  // Combine the AI's own risk read with how the position is performing.
  // A deeply-underwater position elevates risk; a strongly-winning one with
  // confluence dampens it.
  const r = (aiRisk ?? 'MEDIUM').toUpperCase()
  if (healthScore >= 85)  return { label: 'Very Low Risk', tone: 'green' }
  if (healthScore >= 70)  return { label: 'Low Risk',      tone: 'green' }
  if (healthScore >= 45)  return { label: r === 'HIGH' ? 'Elevated Risk' : 'Moderate Risk', tone: 'amber' }
  if (healthScore >= 25)  return { label: 'High Risk',     tone: 'red' }
  return { label: 'Very High Risk', tone: 'red' }
}

// 2-4 sentence "why" derived from inputs. Uses the AI's own one-line summary
// when it exists; otherwise synthesizes from verdict + gain.
function buildRationale({ aiVerdict, aiSummary, aiConfidence, gainPct, gainDollars, personalLabel, ticker }) {
  const v = (aiVerdict ?? 'HOLD').toUpperCase()
  const conf = Number.isFinite(aiConfidence) ? aiConfidence : null

  const positionLine = gainPct == null
    ? null
    : `Your ${ticker} position is currently ${gainPct >= 0 ? 'up' : 'down'} ${Math.abs(gainPct).toFixed(1)}% (${fmtMoney(gainDollars, { sign: true })}).`

  const aiLine = aiSummary
    ? `The current Kairo verdict is ${v}${conf != null ? ` at ${conf}% confidence` : ''} — ${aiSummary}`
    : `The current Kairo verdict is ${v}${conf != null ? ` at ${conf}% confidence` : ''}.`

  const advisoryLine = (() => {
    switch (personalLabel) {
      case 'Take Partial Profits':
      case 'Consider Taking Profits':
        return 'Locking in some of the gain while the technical setup is still constructive reduces drawdown risk without abandoning the thesis.'
      case 'Hold & Let It Run':
        return 'Momentum and confidence both point in your direction; trimming early often forfeits the largest part of a winning trade.'
      case 'Buy More':
        return 'Adding on weakness is consistent with the bullish read, but size additions so a single drawdown doesn\'t define the position.'
      case 'Average Down Carefully':
        return 'Cost-average on confirmed support — never on hope alone.'
      case 'Hold & Watch Closely':
      case 'Hold & Reduce Risk':
        return 'The setup is mixed; a smaller tactical stop or trim can preserve optionality without giving up the position entirely.'
      case 'Take Profits Now':
      case 'Cut Losses':
      case 'Reduce Exposure':
        return 'The downside read is strong enough that preserving capital outweighs the chance of being wrong on the exit.'
      case 'Hold':
      default:
        return 'No urgent edge to act either way; revisit when the technical picture or your cost basis changes meaningfully.'
    }
  })()

  return [positionLine, aiLine, advisoryLine].filter(Boolean).join(' ')
}

function buildNextSteps({ aiVerdict, gainPct, riskLevel, personalLabel, ticker }) {
  const v = (aiVerdict ?? 'HOLD').toUpperCase()
  const r = (riskLevel ?? 'MEDIUM').toUpperCase()
  const steps = []

  if (personalLabel.includes('Take Partial') || personalLabel.includes('Profits')) {
    steps.push(`Consider trimming 25-50% of ${ticker} into strength to lock in the unrealized gain.`)
    steps.push('Move your mental stop up so the remaining position can\'t turn a winner into a loser.')
  } else if (personalLabel === 'Hold & Let It Run' || personalLabel === 'Hold') {
    steps.push(`Continue holding ${ticker} while the trend remains intact.`)
    steps.push('Monitor RSI and volume for early signs of momentum weakening.')
  } else if (personalLabel === 'Buy More') {
    steps.push('Wait for a pullback toward support before adding, rather than chasing strength.')
    steps.push('Size the add so a single drawdown doesn\'t double your effective basis.')
  } else if (personalLabel === 'Average Down Carefully') {
    steps.push('Avoid catching the falling knife — wait for a confirmed reclaim of a prior support level.')
    steps.push('Cap the add at 25-50% of the original position size.')
  } else if (personalLabel.includes('Watch')) {
    steps.push('Set a clear technical level that, if broken, would change your stance.')
    steps.push('Avoid adding until the indicators reach a confluence again.')
  } else if (personalLabel.includes('Cut') || personalLabel.includes('Reduce') || personalLabel === 'Take Profits Now') {
    steps.push(`Reduce ${ticker} into any near-term bounce rather than panic-selling on weakness.`)
    steps.push('Redeploy proceeds into watchlist names with a stronger technical setup.')
  }

  if (r === 'HIGH') steps.push('Position size is more important than entry — keep this name a smaller share of the portfolio.')
  if (gainPct != null && gainPct < -20) steps.push('Decide in advance the stop that would force you out — emotion is the biggest risk in a deeply red trade.')

  return steps.slice(0, 4)
}

// ──────────────────────────────────────────────────────────────────────────────
// Health Score gauge — pure SVG, animates the dasharray on score change.
function HealthRing({ score }) {
  const radius = 38
  const circ = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, score)) / 100
  const dash = circ * pct
  const color = score >= 75 ? '#22B585'
              : score >= 60 ? '#22B585'
              : score >= 40 ? '#e3a234'
              : '#ef5454'
  return (
    <svg width="104" height="104" viewBox="0 0 100 100" aria-label={`Position health ${score} of 100`} role="img">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--c-chip-bg)" strokeWidth="6"/>
      <circle
        cx="50" cy="50" r={radius} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 500ms var(--ease-out), stroke 200ms ease' }}
      />
      <text x="50" y="48" textAnchor="middle" fontSize="28" fontWeight="900" fill="var(--c-text-strong)" style={{ dominantBaseline: 'central' }}>{score}</text>
      <text x="50" y="68" textAnchor="middle" fontSize="9" fill="var(--c-text-fainter)" letterSpacing="0.18em" style={{ textTransform: 'uppercase' }}>Health</text>
    </svg>
  )
}

// Compact "insight" chip. Tones map to the same brand-tinted families used
// elsewhere (green / amber / red / neutral).
function InsightChip({ label, value, tone = 'neutral' }) {
  const toneClass = tone === 'green'  ? 'text-[#22B585] border-[#22B585]/30 bg-[#22B585]/10'
                  : tone === 'amber'  ? 'text-[#e3a234] border-[#e3a234]/30 bg-[#e3a234]/10'
                  : tone === 'red'    ? 'text-[#ef5454] border-[#ef5454]/30 bg-[#ef5454]/10'
                  : 'text-[var(--c-text-faint)] border-[var(--c-border)] bg-[var(--c-card)]'
  return (
    <div className={`flex flex-col gap-0.5 px-3 py-2 rounded-lg border ${toneClass} min-w-[96px]`}>
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-80">{label}</span>
      <span className="text-[13px] font-bold tabular-nums leading-tight">{value}</span>
    </div>
  )
}

function Metric({ label, value, tone }) {
  const colorClass = tone === 'green' ? 'text-[#22B585]'
                   : tone === 'red'   ? 'text-[#ef5454]'
                   : 'text-[var(--c-text)]'
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">{label}</span>
      <span className={`text-base font-black tabular-nums leading-none ${colorClass}`}>{value}</span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
export default function MyPosition({ ticker, aiData, currentPrice, userId }) {
  const [costBasis, setCostBasis] = useState('')   // raw value the user typed
  const [shares,    setShares]    = useState('')
  const [costMode,  setCostMode]  = useState('avg')  // 'avg' = per-share | 'total' = total $
  // Conviction Log state — checked on ticker change (was there a prior thesis?)
  // and re-evaluated whenever calcs becomes valid (offer the capture prompt).
  const [conviction,  setConviction]  = useState(null)
  const [thesisDraft, setThesisDraft] = useState('')
  const [showCapture, setShowCapture] = useState(false)

  // Reload saved values whenever the active ticker changes.
  useEffect(() => {
    const v = loadPosition(ticker)
    setCostBasis(v.costBasis)
    setShares(v.shares)
    setCostMode(v.costMode)
    setShowCapture(false)
    setThesisDraft('')
    setConviction(null)
    // Look up any existing conviction for this ticker so we don't re-prompt.
    if (userId && ticker) {
      fetchLatestConviction({ userId, ticker }).then(setConviction)
    }
  }, [ticker, userId])

  // Persist on change. Debounce-light via a 300ms timer so we don't write
  // localStorage on every keystroke.
  useEffect(() => {
    if (!ticker) return
    const t = setTimeout(() => savePosition(ticker, { costBasis, shares, costMode }), 300)
    return () => clearTimeout(t)
  }, [ticker, costBasis, shares, costMode])

  // Switch between 'avg' and 'total' modes. If both fields are populated we
  // auto-convert the cost field so the user's effective basis doesn't change
  // when they flip the toggle (10 shares × $500 → $5000 total ↔ $500 / share).
  const switchCostMode = (next) => {
    if (next === costMode) return
    const v  = parseFloat(costBasis)
    const sh = parseFloat(shares)
    if (Number.isFinite(v) && v > 0 && Number.isFinite(sh) && sh > 0) {
      const converted = next === 'total' ? v * sh : v / sh
      setCostBasis(converted.toFixed(2))
    }
    setCostMode(next)
  }

  // The single canonical "per-share cost" derived from whatever the user typed.
  // Avg mode  → use input directly.
  // Total mode → divide by shares (requires shares to be populated to be meaningful).
  const perShareCost = useMemo(() => {
    const v  = parseFloat(costBasis)
    const sh = parseFloat(shares)
    if (!Number.isFinite(v) || v <= 0) return null
    if (costMode === 'total') {
      if (!Number.isFinite(sh) || sh <= 0) return null
      return v / sh
    }
    return v
  }, [costBasis, shares, costMode])

  // Live-derived numbers — all downstream math runs off perShareCost so the
  // toggle is invisible to every calculation below this point.
  const calcs = useMemo(() => {
    const sh = parseFloat(shares)
    const px = currentPrice
    const cb = perShareCost
    const valid = Number.isFinite(cb) && cb > 0
               && Number.isFinite(sh) && sh > 0
               && Number.isFinite(px) && px > 0
    if (!valid) return { valid: false }
    const totalCost   = cb * sh
    const value       = px * sh
    const gainDollars = value - totalCost
    const gainPct     = (gainDollars / totalCost) * 100
    const perShare    = px - cb
    const breakeven   = cb
    const distFromBE  = px - breakeven
    return { valid: true, totalCost, value, gainDollars, gainPct, perShare, breakeven, distFromBE }
  }, [perShareCost, shares, currentPrice])

  const aiVerdict    = aiData?.recommendation
  const aiConfidence = aiData?.confidence
  const aiRisk       = aiData?.riskLevel
  const aiSummary    = aiData?.summary

  const personalRec = useMemo(() => derivePersonalRec({
    aiVerdict, gainPct: calcs.valid ? calcs.gainPct : 0, riskLevel: aiRisk,
  }), [aiVerdict, aiRisk, calcs.valid, calcs.gainPct])

  const healthScore = useMemo(() => deriveHealthScore({
    aiVerdict, aiConfidence, riskLevel: aiRisk,
    gainPct: calcs.valid ? calcs.gainPct : 0,
  }), [aiVerdict, aiConfidence, aiRisk, calcs.valid, calcs.gainPct])

  const risk = useMemo(() => riskLabel({ aiRisk, gainPct: calcs.valid ? calcs.gainPct : 0, healthScore }),
    [aiRisk, calcs.valid, calcs.gainPct, healthScore])

  const rationale = useMemo(() => buildRationale({
    aiVerdict, aiSummary, aiConfidence,
    gainPct: calcs.valid ? calcs.gainPct : null,
    gainDollars: calcs.valid ? calcs.gainDollars : null,
    personalLabel: personalRec.label,
    ticker,
  }), [aiVerdict, aiSummary, aiConfidence, calcs.valid, calcs.gainPct, calcs.gainDollars, personalRec.label, ticker])

  const nextSteps = useMemo(() => buildNextSteps({
    aiVerdict, riskLevel: aiRisk,
    gainPct: calcs.valid ? calcs.gainPct : null,
    personalLabel: personalRec.label, ticker,
  }), [aiVerdict, aiRisk, calcs.valid, calcs.gainPct, personalRec.label, ticker])

  if (!ticker) return null

  // Inputs are always rendered; everything below shows only once they're filled.
  const summaryTone = !calcs.valid ? 'neutral' : calcs.gainDollars > 0 ? 'green' : calcs.gainDollars < 0 ? 'red' : 'neutral'
  const summaryText = !calcs.valid
    ? 'Enter your cost basis and shares to see your personalized analysis.'
    : `You're ${calcs.gainDollars >= 0 ? 'up' : 'down'} ${fmtMoney(calcs.gainDollars).replace('-', '')} (${fmtPct(calcs.gainPct)}) on this position.`
  const summaryColor = summaryTone === 'green' ? '#22B585' : summaryTone === 'red' ? '#ef5454' : 'var(--c-text)'

  const verdictColor = personalRec.tone === 'green' ? '#22B585'
                     : personalRec.tone === 'amber' ? '#e3a234'
                     : personalRec.tone === 'red'   ? '#ef5454'
                     : 'var(--c-text)'

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-5 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center">
          My Position
          <InfoTooltip>
            Enter what you actually paid and how many shares you hold to get a recommendation that reflects your cost basis and current P/L — not just the stock's overall AI verdict. Saved locally per ticker on this device.
          </InfoTooltip>
        </span>
        {calcs.valid && (
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest ${
            risk.tone === 'green' ? 'text-[#22B585] border-[#22B585]/30 bg-[#22B585]/10' :
            risk.tone === 'amber' ? 'text-[#e3a234] border-[#e3a234]/30 bg-[#e3a234]/10' :
                                    'text-[#ef5454] border-[#ef5454]/30 bg-[#ef5454]/10'
          }`}>
            {risk.label}
          </span>
        )}
      </div>

      {/* Inputs */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          {/* Label row holds the mode toggle so it's visible inline with the input. */}
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest" htmlFor={`mp-cb-${ticker}`}>
              {costMode === 'total' ? 'Total Paid' : 'Avg Cost / Share'}
            </label>
            <div className="inline-flex border border-[var(--c-input-border)] bg-[var(--c-input-bg)] rounded-md p-0.5">
              {[
                { v: 'avg',   l: '$/sh'  },
                { v: 'total', l: 'Total' },
              ].map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => switchCostMode(opt.v)}
                  title={opt.v === 'avg' ? 'Enter average price per share' : 'Enter total dollars paid across all shares'}
                  className={`text-[9px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                    costMode === opt.v
                      ? 'bg-[#22B585]/15 text-[#22B585]'
                      : 'text-[var(--c-text-faint)] hover:text-[var(--c-text)]'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
          <input
            id={`mp-cb-${ticker}`}
            type="number"
            min="0"
            step="0.01"
            value={costBasis}
            onChange={e => setCostBasis(e.target.value)}
            placeholder={
              costMode === 'total'
                ? (currentPrice && parseFloat(shares) > 0
                    ? `e.g. ${(currentPrice * parseFloat(shares)).toFixed(2)}`
                    : 'Total $')
                : (currentPrice ? `e.g. ${currentPrice.toFixed(2)}` : 'Per share')
            }
            inputMode="decimal"
            className={`${costMode === 'total' ? 'w-36' : 'w-32'} bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-3 py-2 text-sm text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors tabular-nums`}
          />
          {/* Derived value shown below so the user knows what mode resolves to. */}
          {perShareCost != null && costMode === 'total' && (
            <span className="text-[10px] font-mono text-[var(--c-text-fainter)] tabular-nums">
              = ${perShareCost.toFixed(2)} / share
            </span>
          )}
          {perShareCost != null && costMode === 'avg' && parseFloat(shares) > 0 && (
            <span className="text-[10px] font-mono text-[var(--c-text-fainter)] tabular-nums">
              = ${(perShareCost * parseFloat(shares)).toFixed(2)} total
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest" htmlFor={`mp-sh-${ticker}`}>Shares</label>
          <input
            id={`mp-sh-${ticker}`}
            type="number"
            min="0"
            step="0.01"
            value={shares}
            onChange={e => setShares(e.target.value)}
            placeholder="Quantity"
            inputMode="decimal"
            className="w-28 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-3 py-2 text-sm text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors tabular-nums"
          />
        </div>
        {calcs.valid && (
          <button
            type="button"
            onClick={() => { setCostBasis(''); setShares(''); setCostMode('avg') }}
            className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--c-text-faint)] hover:text-[#ef5454] transition-colors cursor-pointer mb-2.5"
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary line — always rendered (empty-state hint or live P/L) */}
      <p className="text-[14px] font-semibold leading-snug" style={{ color: summaryColor }}>
        {summaryText}
      </p>

      {/* Conviction Log — capture prompt when a position just got filled.
          Renders only for signed-in users with no prior thesis on this
          ticker. Soft + dismissible. */}
      {calcs.valid && userId && conviction === null && !showCapture && (
        <button
          type="button"
          onClick={() => setShowCapture(true)}
          className="text-left text-[12px] text-[var(--c-text-faint)] italic hover:text-[#22B585] transition-colors cursor-pointer self-start"
        >
          + Add the thesis for this position (Kairo asks back in 30 days)
        </button>
      )}
      {showCapture && (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-[#22B585]/30 bg-[#22B585]/5 animate-fade">
          <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#22B585]">Why are you buying {ticker}?</label>
          <textarea
            value={thesisDraft}
            onChange={(e) => setThesisDraft(e.target.value.slice(0, 280))}
            placeholder={`e.g. Earnings should beat; Q3 guide raised; insiders buying. (${280 - thesisDraft.length} chars left)`}
            rows={2}
            className="w-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-3 py-2 text-[13px] text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!thesisDraft.trim()}
              onClick={async () => {
                const saved = await saveConviction({
                  userId, ticker, thesis: thesisDraft,
                  capturedVerdict:    aiVerdict,
                  capturedConfidence: aiConfidence,
                  capturedPrice:      currentPrice,
                })
                if (saved) {
                  setConviction(saved)
                  setThesisDraft('')
                  setShowCapture(false)
                  toast.success('Thesis saved to your Conviction Log')
                } else {
                  toast.error('Could not save thesis')
                }
              }}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#22B585] hover:bg-[#2BC093] disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
            >
              Save thesis
            </button>
            <button
              type="button"
              onClick={() => { setShowCapture(false); setThesisDraft('') }}
              className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--c-text-faint)] hover:text-[var(--c-text)] cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {conviction && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-[var(--c-border)] bg-[var(--c-input-bg)] text-[12.5px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)] mt-0.5 shrink-0">Thesis</span>
          <span className="text-[var(--c-text)] leading-relaxed flex-1">{conviction.thesis}</span>
        </div>
      )}

      {calcs.valid && (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-1 border-t border-[var(--c-border)]">
            <Metric label="Total Cost"      value={fmtMoney(calcs.totalCost)} />
            <Metric label="Current Value"   value={fmtMoney(calcs.value)} />
            <Metric label="P/L"             value={fmtMoney(calcs.gainDollars, { sign: true })} tone={calcs.gainDollars >= 0 ? 'green' : 'red'} />
            <Metric label="P/L per share"   value={fmtMoney(calcs.perShare, { sign: true })}    tone={calcs.perShare >= 0 ? 'green' : 'red'} />
            <Metric label="Break-even"      value={fmtMoney(calcs.breakeven)} />
            <Metric label="Distance to B/E" value={fmtMoney(calcs.distFromBE, { sign: true })}  tone={calcs.distFromBE >= 0 ? 'green' : 'red'} />
          </div>

          {/* Quick insights chip row */}
          <div className="flex flex-wrap gap-2">
            <InsightChip
              label="Trend"
              value={aiVerdict === 'BUY' ? 'Bullish' : aiVerdict === 'SELL' ? 'Bearish' : 'Neutral'}
              tone={aiVerdict === 'BUY' ? 'green' : aiVerdict === 'SELL' ? 'red' : 'neutral'}
            />
            <InsightChip
              label="Momentum"
              value={(aiConfidence ?? 0) >= 70 ? 'Strong' : (aiConfidence ?? 0) >= 50 ? 'Moderate' : 'Weak'}
              tone={(aiConfidence ?? 0) >= 70 ? 'green' : (aiConfidence ?? 0) >= 50 ? 'amber' : 'red'}
            />
            <InsightChip
              label="Profit Status"
              value={calcs.gainDollars >= 0 ? `Gain ${fmtPct(calcs.gainPct)}` : `Loss ${fmtPct(calcs.gainPct)}`}
              tone={calcs.gainDollars >= 0 ? 'green' : 'red'}
            />
            <InsightChip
              label="AI Confidence"
              value={aiConfidence != null ? `${aiConfidence}/100` : '—'}
              tone={(aiConfidence ?? 0) >= 70 ? 'green' : (aiConfidence ?? 0) >= 50 ? 'amber' : 'neutral'}
            />
            <InsightChip
              label="Risk Level"
              value={risk.label.replace(' Risk', '')}
              tone={risk.tone}
            />
          </div>

          {/* Personalized recommendation card */}
          <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-5 flex flex-col gap-4">
            <div className="flex items-start gap-5 flex-wrap">
              <HealthRing score={healthScore} />
              <div className="flex-1 min-w-[200px] flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Personalized Recommendation</span>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="text-3xl font-black tracking-tight leading-none"
                    style={{ color: verdictColor }}
                    role="text"
                    aria-label={`Personalized recommendation: ${personalRec.label}`}
                  >
                    <span aria-hidden="true" className="mr-2 text-2xl">{personalRec.glyph}</span>
                    {personalRec.label}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--c-text)]/85">{rationale}</p>
              </div>
            </div>
          </div>

          {/* Suggested next steps */}
          {nextSteps.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Suggested Next Steps</span>
              <ul className="flex flex-col gap-1.5">
                {nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--c-text)] leading-relaxed">
                    <span className="text-[#22B585] mt-1 leading-none shrink-0" aria-hidden="true">→</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
