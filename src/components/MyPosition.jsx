import { useEffect, useMemo, useState } from 'react'
import InfoTooltip from './InfoTooltip'
import { fetchLatestConviction, saveConviction } from '../services/convictionLog'
import { toast } from '../utils/toast'
import { buildPositionContext } from '../utils/positionContext'

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

// ── Direction / risk → colour + glyph. Direction and risk are SEPARATE axes
//    (spec §2): the verdict colour comes from direction, the risk chip from the
//    risk level. They never derive from one another.
const DIRECTION_STYLE = {
  bullish: { color: '#22B585', glyph: '▲', tone: 'green'   },
  neutral: { color: '#e3a234', glyph: '─', tone: 'amber'   },
  bearish: { color: '#ef5454', glyph: '▼', tone: 'red'     },
}
function riskTone(level) {
  switch (level) {
    case 'LOW':      return 'green'
    case 'MODERATE': return 'amber'
    case 'ELEVATED': return 'amber'
    default:         return 'red' // HIGH / EXTREME
  }
}

// ── Health Score gauge — pure SVG, animates the dasharray on score change.
function HealthRing({ score }) {
  const radius = 38
  const circ = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, score)) / 100
  const dash = circ * pct
  const color = score >= 60 ? '#22B585' : score >= 40 ? '#e3a234' : '#ef5454'
  return (
    <svg width="104" height="104" viewBox="0 0 100 100" aria-label={`Position setup health ${score} of 100`} role="img">
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
  const [conviction,  setConviction]  = useState(null)
  const [thesisDraft, setThesisDraft] = useState('')
  const [showCapture, setShowCapture] = useState(false)

  useEffect(() => {
    const v = loadPosition(ticker)
    setCostBasis(v.costBasis)
    setShares(v.shares)
    setCostMode(v.costMode)
    setShowCapture(false)
    setThesisDraft('')
    setConviction(null)
    if (userId && ticker) {
      fetchLatestConviction({ userId, ticker }).then(setConviction)
    }
  }, [ticker, userId])

  useEffect(() => {
    if (!ticker) return
    const t = setTimeout(() => savePosition(ticker, { costBasis, shares, costMode }), 300)
    return () => clearTimeout(t)
  }, [ticker, costBasis, shares, costMode])

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

  // The MARKET decision comes straight from the unified engine (aiData). Position
  // data never changes it — it only adds risk-management context + next steps.
  const hasDecision = !!aiData?.verdictLabel && !aiData?.unavailable
  const direction   = aiData?.direction ?? 'neutral'
  const dirStyle    = DIRECTION_STYLE[direction] ?? DIRECTION_STYLE.neutral

  const posCtx = useMemo(() => {
    if (!hasDecision) return null
    const position = calcs.valid
      ? { gainPct: calcs.gainPct, gainDollars: calcs.gainDollars, breakeven: calcs.breakeven, price: currentPrice }
      : null
    return buildPositionContext({ decision: aiData, position })
  }, [hasDecision, aiData, calcs, currentPrice])

  if (!ticker) return null

  const summaryTone = !calcs.valid ? 'neutral' : calcs.gainDollars > 0 ? 'green' : calcs.gainDollars < 0 ? 'red' : 'neutral'
  const summaryText = !calcs.valid
    ? 'Enter your cost basis and shares to see your personalized analysis.'
    : `You're ${calcs.gainDollars >= 0 ? 'up' : 'down'} ${fmtMoney(calcs.gainDollars).replace('-', '')} (${fmtPct(calcs.gainPct)}) on this position.`
  const summaryColor = summaryTone === 'green' ? '#22B585' : summaryTone === 'red' ? '#ef5454' : 'var(--c-text)'

  const steps = posCtx?.steps ?? []

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-5 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center">
          My Position
          <InfoTooltip>
            Enter what you paid and how many shares you hold. The market verdict comes from Kairo's decision engine and does not change based on your P/L — your cost basis only shapes the risk-management context and next steps. Saved locally per ticker on this device.
          </InfoTooltip>
        </span>
        {hasDecision && aiData.risk && (
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest ${
            riskTone(aiData.risk.level) === 'green' ? 'text-[#22B585] border-[#22B585]/30 bg-[#22B585]/10' :
            riskTone(aiData.risk.level) === 'amber' ? 'text-[#e3a234] border-[#e3a234]/30 bg-[#e3a234]/10' :
                                                      'text-[#ef5454] border-[#ef5454]/30 bg-[#ef5454]/10'
          }`}>
            {aiData.risk.label}
          </span>
        )}
      </div>

      {/* Inputs */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
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

      {/* Conviction Log — capture prompt when a position just got filled. */}
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
                  capturedVerdict:    aiData?.verdict,
                  capturedConfidence: aiData?.confidence,
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

          {/* Insight chips — each reads its OWN axis (no cross-mirroring). */}
          {hasDecision && (
            <div className="flex flex-wrap gap-2">
              <InsightChip label="Direction" value={direction[0].toUpperCase() + direction.slice(1)} tone={dirStyle.tone} />
              <InsightChip label="Confidence" value={aiData.confidence != null ? `${aiData.confidence}%` : '—'} tone={aiData.confidence >= 70 ? 'green' : aiData.confidence >= 55 ? 'amber' : 'neutral'} />
              <InsightChip label="Setup Health" value={`${aiData.healthScore}/100`} tone={aiData.healthScore >= 60 ? 'green' : aiData.healthScore >= 40 ? 'amber' : 'red'} />
              <InsightChip label="Risk" value={aiData.risk?.label?.replace(' Risk', '') ?? '—'} tone={riskTone(aiData.risk?.level)} />
              <InsightChip label="Profit Status" value={calcs.gainDollars >= 0 ? `Gain ${fmtPct(calcs.gainPct)}` : `Loss ${fmtPct(calcs.gainPct)}`} tone={calcs.gainDollars >= 0 ? 'green' : 'red'} />
            </div>
          )}

          {/* Verdict card — the market verdict (engine), then position context. */}
          {hasDecision && (
            <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-card)] p-5 flex flex-col gap-4">
              <div className="flex items-start gap-5 flex-wrap">
                <HealthRing score={aiData.healthScore} />
                <div className="flex-1 min-w-[200px] flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Kairo Verdict</span>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span
                      className="text-3xl font-black tracking-tight leading-none"
                      style={{ color: dirStyle.color }}
                      role="text"
                      aria-label={`Verdict: ${aiData.verdictLabel}, ${aiData.confidence}% confidence`}
                    >
                      <span aria-hidden="true" className="mr-2 text-2xl">{dirStyle.glyph}</span>
                      {aiData.verdictLabel}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: dirStyle.color }}>
                      {aiData.confidence}% confidence
                    </span>
                  </div>
                  {aiData.narrative?.why && (
                    <p className="text-[13px] leading-relaxed text-[var(--c-text)]/85">{aiData.narrative.why}</p>
                  )}
                  {posCtx?.contextText && (
                    <p className="text-[12.5px] leading-relaxed text-[var(--c-text-faint)] border-t border-[var(--c-border)] pt-2">
                      <span className="font-bold uppercase tracking-[0.14em] text-[10px] text-[var(--c-text-fainter)] mr-1.5">Your position:</span>
                      {posCtx.contextText}
                    </p>
                  )}
                  {posCtx?.positionRisk && (
                    <p className="text-[12px] leading-relaxed text-[#e3a234]/90">{posCtx.positionRisk}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Suggested next steps — follow the verdict + position (max 3). */}
          {steps.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--c-text-faint)]">Suggested Next Steps</span>
              <ul className="flex flex-col gap-1.5">
                {steps.map((step, i) => (
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
