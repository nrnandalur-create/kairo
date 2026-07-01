import { useEffect, useState } from 'react'
import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'
import { toast } from '../utils/toast'

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

export default function Recommendation({ data, loading, error, asOf, ticker, onCompare }) {
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

  // Three-state render: success > skeleton > confirmed-failure.
  if (data?.verdict) {
    // fall through to the normal card render below
  } else if (loading || !revealError) {
    return <Skeleton showSlowMessage={slowLoad} />
  } else {
    return <Unavailable ticker={ticker} error={error} />
  }

  const rec        = data.verdict
  const cfg        = CONFIG[rec] ?? CONFIG.HOLD
  const confidence = typeof data.confidence === 'number' ? Math.min(100, Math.max(0, data.confidence)) : 0
  const riskClass  = RISK[data.riskLevel] ?? RISK.MEDIUM

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
            Verdict, confidence, entry, and stop derived from a Groq LLaMA-3.3 model conditioned on technical indicators and recent OHLC. Educational only — not financial advice.
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
            {data.riskLevel ?? 'MEDIUM'} Risk
          </span>
        </div>
      </div>

      {/* Verdict + confidence — scales down two full steps on mobile so the
          verdict word + confidence bar both stay on one row at 375px. */}
      <div className="relative flex items-end gap-4 sm:gap-6 flex-wrap">
        <span className="text-5xl sm:text-6xl md:text-7xl font-black leading-none tracking-tight flex items-center gap-2 sm:gap-3" style={{ color: cfg.color }} role="text" aria-label={`Verdict: ${cfg.label}`}>
          <span aria-hidden="true" className="text-3xl sm:text-4xl leading-none">{cfg.glyph}</span>
          {cfg.label}
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

      {/* Entry / Stop grid */}
      {(data.entryPrice || data.stopLoss) && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[var(--c-border)]">
          {data.entryPrice && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-[var(--c-text-faint)] uppercase tracking-[0.12em] font-semibold">Entry</p>
              <p className="text-base font-bold text-[var(--c-text)] tabular-nums">${Number(data.entryPrice).toFixed(2)}</p>
            </div>
          )}
          {data.stopLoss && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-[var(--c-text-faint)] uppercase tracking-[0.12em] font-semibold">Stop Loss</p>
              <p className="text-base font-bold tabular-nums" style={{ color: '#ef5454' }}>${Number(data.stopLoss).toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer — data freshness */}
      {asOf && (
        <div className="relative flex items-center justify-end pt-3 -mb-1 border-t border-[var(--c-border)]/60">
          <DataTimestamp asOf={asOf} source="Groq" />
        </div>
      )}
    </div>
  )
}
