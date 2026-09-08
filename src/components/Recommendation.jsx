import { useEffect, useState } from 'react'
import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'
import { toast } from '../utils/toast'
import { UnavailableBadge, UnavailableNotice } from './DataUnavailable'

// How long to keep showing the skeleton after the request has confirmed-failed
// before swapping in the "unavailable" card. Protects against transient blips
// that resolve on retry, and prevents users from being misled during a slow
// first-load when Vercel's serverless cold-start can take 5-10s.
const ERROR_REVEAL_DELAY_MS = 4000

const CONFIG = {
  // glyph: secondary visual signal alongside color so the verdict reads
  // unambiguously for color-blind users (▲ buy, ─ hold, ▼ sell).
  BUY:  { label: 'BUY',  glyph: '▲', color: '#22B585', bg: 'bg-[#22B585]/10', border: 'border-[#22B585]/30', bar: '#22B585', glow: 'rgba(29,158,117,0.07)' },
  HOLD: { label: 'HOLD', glyph: '─', color: '#e3a234', bg: 'bg-[#e3a234]/10',  border: 'border-[#e3a234]/30', bar: '#e3a234', glow: 'rgba(212,146,42,0.07)'  },
  SELL: { label: 'SELL', glyph: '▼', color: '#ef5454', bg: 'bg-[#ef5454]/10',  border: 'border-[#ef5454]/30', bar: '#ef5454', glow: 'rgba(226,75,74,0.07)'   },
}

const RISK = {
  LOW:    'bg-[#22B585]/10 text-[#22B585] border-[#22B585]/25',
  MEDIUM: 'bg-[#e3a234]/10 text-[#e3a234] border-[#e3a234]/25',
  HIGH:   'bg-[#ef5454]/10 text-[#ef5454] border-[#ef5454]/25',
}

// Risk (5 levels) is a SEPARATE axis from direction (spec §2).
const RISK_LEVEL = {
  LOW:      RISK.LOW,
  MODERATE: RISK.MEDIUM,
  ELEVATED: 'bg-[#e3a234]/12 text-[#e3a234] border-[#e3a234]/30',
  HIGH:     RISK.HIGH,
  EXTREME:  'bg-[#ef5454]/15 text-[#ef5454] border-[#ef5454]/40',
}
// Verdict colour/glyph come from DIRECTION, never from risk.
const DIR_STYLE = {
  bullish: { color: '#22B585', glyph: '▲' },
  neutral: { color: '#e3a234', glyph: '─' },
  bearish: { color: '#ef5454', glyph: '▼' },
}

// Debug flag: ?debug=1 in the URL or a Vite dev build exposes the engine's
// internal scores so a recommendation is fully explainable (spec §12).
const DEBUG = (typeof window !== 'undefined' && /[?&]debug=1\b/.test(window.location.search))
  || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)

function SkeletonLine({ w = 'full' }) {
  return <div className={`h-3 rounded-full shimmer w-${w}`} />
}

function Skeleton({ showSlowMessage }) {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-5 animate-fade">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[#22B585] animate-pulse" />
        <div className="h-2.5 w-40 rounded-full shimmer" />
      </div>
      <div className="h-16 w-36 rounded-xl shimmer" />
      <div className="flex flex-col gap-2.5">
        <SkeletonLine w="4/5" />
        <SkeletonLine w="3/5" />
        <SkeletonLine w="2/3" />
      </div>
      {showSlowMessage && (
        <p className="text-[12px] text-[var(--c-text-faint)] italic mt-1 animate-fade">
          Analysis is taking longer than usual — Vercel cold-starts can add a few seconds on the first request. Hang tight.
        </p>
      )}
    </div>
  )
}

// Honest "unavailable" card — never lies about WHY analysis isn't shown.
function Unavailable({ ticker, error }) {
  const msg =
    error && /timeout|timed out/i.test(error)
      ? 'Analysis request timed out. Try refreshing in a moment — the model can be slow on cold starts.'
      : error && /candle|data unavailable/i.test(error)
      ? `Real candle data for ${ticker ?? 'this ticker'} is unavailable right now. Analysis runs again as soon as live OHLC returns.`
      : error
      ? 'Analysis temporarily unavailable. Refresh or try again shortly.'
      : 'Analysis temporarily unavailable. Refresh or try again shortly.'
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex items-start gap-3 animate-fade">
      <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] text-[var(--c-text-fainter)] flex items-center justify-center text-base">—</span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-[var(--c-text)]">AI recommendation unavailable</span>
        <span className="text-[12px] text-[var(--c-text-faint)] leading-relaxed">{msg}</span>
      </div>
    </div>
  )
}

// Insufficient-technical-data state — the trust-critical case. Rendered when
// real OHLC is unavailable (synthetic candles) or the server explicitly
// refused to produce a verdict. We show the SAME amber notice the AI Analysis
// and Indicators panels use — never a confident BUY/SELL/HOLD on no data.
function InsufficientData() {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-fade">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center">
          AI Recommendation
          <InfoTooltip>
            A verdict is only generated when real technical indicators (RSI, MACD, Bollinger Bands) are available. Right now they aren't, so no call is shown. Educational only — not financial advice.
          </InfoTooltip>
        </span>
        <UnavailableBadge />
      </div>
      <UnavailableNotice title="Recommendation unavailable">
        Insufficient technical data. A BUY/SELL/HOLD call is withheld until live RSI, MACD,
        and Bollinger Bands return — we never generate a verdict from simulated or missing data.
      </UnavailableNotice>
    </div>
  )
}

export default function Recommendation({ data, loading, error, asOf, ticker, onCompare, synthetic }) {
  // Defer revealing the error/unavailable state for ERROR_REVEAL_DELAY_MS so
  // a slow request, a transient blip, or a fast loading→success transition
  // doesn't flicker through the "unavailable" card.
  const [revealError, setRevealError] = useState(false)
  useEffect(() => {
    if (data?.verdict || loading) { setRevealError(false); return }
    // We're in a state where data is missing AND not loading. Wait before
    // committing to showing the error card.
    const id = setTimeout(() => setRevealError(true), ERROR_REVEAL_DELAY_MS)
    return () => clearTimeout(id)
  }, [data, loading, error])

  // Show a friendly "still loading…" message if the request has been in
  // flight for more than 3 seconds.
  const [slowLoad, setSlowLoad] = useState(false)
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return }
    const id = setTimeout(() => setSlowLoad(true), 3000)
    return () => clearTimeout(id)
  }, [loading])

  const handleShare = async () => {
    if (!ticker) return
    const url = `${window.location.origin}/t/${ticker}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Link copied: ${url}`)
    } catch {
      toast.error('Clipboard not available — copy manually from the address bar')
    }
  }

  // TRUST GUARD (client-side belt to the server's suspenders): if the candles
  // are synthetic, or the server explicitly refused to produce a verdict on
  // insufficient technical data, NEVER show a confident call. This must win
  // over every other state below — including a stale cached `data.verdict`
  // that might still be sitting in state from a previous ticker.
  if (synthetic || data?.unavailable) {
    if (loading) return <Skeleton showSlowMessage={slowLoad} />
    return <InsufficientData />
  }

  // Three-state render: success > skeleton > confirmed-failure.
  if (data?.verdict) {
    // fall through to the normal card render below
  } else if (loading || !revealError) {
    return <Skeleton showSlowMessage={slowLoad} />
  } else {
    return <Unavailable ticker={ticker} error={error} />
  }

  const direction    = data.direction ?? (data.verdict === 'BUY' ? 'bullish' : data.verdict === 'SELL' ? 'bearish' : 'neutral')
  const dcfg         = DIR_STYLE[direction] ?? DIR_STYLE.neutral
  const cfg          = { ...(CONFIG[data.verdict] ?? CONFIG.HOLD), color: dcfg.color, glyph: dcfg.glyph, bar: dcfg.color }
  const verdictLabel = data.verdictLabel ?? cfg.label
  const confidence   = typeof data.confidence === 'number' ? Math.min(100, Math.max(0, data.confidence)) : 0
  const riskLevel    = data.risk?.level ?? data.riskLevel ?? 'MEDIUM'
  const riskText     = data.risk?.label ?? `${riskLevel} Risk`
  const riskClass    = RISK_LEVEL[riskLevel] ?? RISK.MEDIUM

  return (
    <div
      className={`relative w-full bg-[var(--c-card)] border ${cfg.border} rounded-xl p-4 sm:p-5 flex flex-col gap-4 sm:gap-5 animate-enter overflow-hidden`}
      // 3px solid verdict-color rule on the left edge — turns the most
      // important card on the page into a real visual anchor without
      // adding any chrome.  The other 3 sides keep the existing subtle
      // tinted border for shape.
      style={{ borderLeft: `3px solid ${cfg.color}` }}
    >
      {/* Ambient verdict glow */}
      <div
        className="absolute -top-8 -left-8 w-48 h-48 rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: cfg.glow }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center">
          AI Recommendation
          <InfoTooltip>
            Verdict, confidence, risk, and health are computed by Kairo's decision engine — it combines the technical indicators into one weighted read, so no single indicator decides the call. Educational only — not financial advice.
          </InfoTooltip>
        </span>
        <div className="flex items-center gap-1.5">
          {ticker && ticker !== 'SPY' && onCompare && (
            <button
              type="button"
              onClick={() => onCompare([ticker, 'SPY'])}
              title={`Compare ${ticker} against SPY`}
              aria-label={`Compare ${ticker} to SPY`}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[var(--c-border)] text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--c-text-faint)] hover:text-[#22B585] hover:border-[#22B585]/40 transition-colors cursor-pointer"
            >
              vs SPY
            </button>
          )}
          {ticker && (
            <button
              type="button"
              onClick={handleShare}
              title={`Copy share link for ${ticker}`}
              aria-label="Share analysis"
              className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-[var(--c-border)] text-[var(--c-text-faint)] hover:text-[#22B585] hover:border-[#22B585]/40 transition-colors cursor-pointer"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M8 2.5L9.5 1L11 2.5M9.5 1V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 4H3.5A1.5 1.5 0 002 5.5v4A1.5 1.5 0 003.5 11h5A1.5 1.5 0 0010 9.5V8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          )}
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest ${riskClass}`}>
            {riskText}
          </span>
        </div>
      </div>

      {/* Verdict + confidence — scales down two full steps on mobile so the
          verdict word + confidence bar both stay on one row at 375px. */}
      <div className="relative flex items-end gap-4 sm:gap-6 flex-wrap">
        <span className="text-4xl sm:text-5xl md:text-6xl font-black leading-none tracking-tight flex items-center gap-2 sm:gap-3" style={{ color: cfg.color }} role="text" aria-label={`Verdict: ${verdictLabel}`}>
          <span aria-hidden="true" className="text-2xl sm:text-3xl leading-none">{cfg.glyph}</span>
          {verdictLabel}
        </span>
        <div className="flex flex-col gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black tabular-nums leading-none" style={{ color: cfg.color }}>{confidence}</span>
            <span className="text-xs sm:text-sm text-[var(--c-text-faint)] font-medium">% confidence</span>
          </div>
          <div className="w-28 sm:w-36 h-1 bg-[var(--c-chip-bg)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full animate-bar"
              style={{ width: `${confidence}%`, backgroundColor: cfg.bar, transformOrigin: 'left' }}
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[var(--c-chip-bg)]" />

      {/* Summary */}
      {data.summary && (
        <p className="text-sm text-[var(--c-text)]/80 leading-relaxed">{data.summary}</p>
      )}

      {/* Entry / Stop grid — each column now includes the verdict model's
          one-sentence reasoning under the number, so the user sees WHY the
          level was chosen, not just what the level is. */}
      {/* PRIMARY RISK */}
      {data.narrative?.primaryRisk && (
        <div className="flex flex-col gap-1 pt-1 border-t border-[var(--c-border)]">
          <p className="text-[10px] text-[var(--c-text-faint)] uppercase tracking-[0.14em] font-semibold">Primary Risk</p>
          <p className="text-[13px] text-[var(--c-text)]/85 leading-relaxed">{data.narrative.primaryRisk}</p>
        </div>
      )}

      {/* WHAT WOULD CHANGE THE THESIS */}
      {data.narrative?.whatWouldChange && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#22B585]/25 bg-[#22B585]/[0.05] p-3 flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#22B585]">More bullish if</p>
            <p className="text-[12.5px] text-[var(--c-text)]/85 leading-relaxed">{data.narrative.whatWouldChange.moreBullishIf}</p>
          </div>
          <div className="rounded-lg border border-[#ef5454]/25 bg-[#ef5454]/[0.05] p-3 flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#ef5454]">More bearish if</p>
            <p className="text-[12.5px] text-[var(--c-text)]/85 leading-relaxed">{data.narrative.whatWouldChange.moreBearishIf}</p>
          </div>
        </div>
      )}

      {/* EVIDENCE — each indicator framed as evidence, never as its own verdict */}
      {Array.isArray(data.signals) && data.signals.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)] hover:text-[var(--c-text)]">
            <span className="transition-transform group-open:rotate-90">▸</span>
            Evidence ({data.signals.length} signals)
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {data.signals.map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-[12px] leading-relaxed">
                <span
                  className="shrink-0 mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: s.direction === 'bullish' ? '#22B585' : s.direction === 'bearish' ? '#ef5454' : '#e3a234',
                    background: (s.direction === 'bullish' ? 'rgba(34,181,133,0.12)' : s.direction === 'bearish' ? 'rgba(239,84,84,0.12)' : 'rgba(227,162,52,0.12)'),
                  }}
                >
                  {s.label}
                </span>
                <span className="text-[var(--c-text)]/80">{s.explanation}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* SUGGESTED NEXT STEPS */}
      {Array.isArray(data.nextSteps) && data.nextSteps.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-[var(--c-text-faint)] uppercase tracking-[0.14em] font-semibold">Suggested Next Steps</p>
          <ul className="flex flex-col gap-1.5">
            {data.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--c-text)] leading-relaxed">
                <span className="text-[#22B585] mt-0.5 shrink-0" aria-hidden="true">→</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* DEBUG — engine internals (dev or ?debug=1), spec §12 */}
      {DEBUG && data.debug && (
        <details className="mt-1 rounded-lg border border-[var(--c-border)] bg-[var(--c-input-bg)] p-3">
          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--c-text-faint)]">
            Engine debug — scores {data.scores?.bullish}↑ / {data.scores?.bearish}↓ · net {data.scores?.net}
          </summary>
          <pre className="mt-2 text-[10px] leading-relaxed text-[var(--c-text-faint)] overflow-x-auto whitespace-pre-wrap">{JSON.stringify(data.debug, null, 2)}</pre>
        </details>
      )}

      {/* Footer — data freshness */}
      {asOf && (
        <div className="relative flex items-center justify-end pt-3 -mb-1 border-t border-[var(--c-border)]/60">
          <DataTimestamp asOf={asOf} source="Kairo engine" />
        </div>
      )}
    </div>
  )
}
