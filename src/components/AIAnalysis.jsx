import { useEffect, useState } from 'react'
import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'

const ERROR_REVEAL_DELAY_MS = 4000

function ConfidenceRing({ confidence }) {
  const s     = typeof confidence === 'number' && !isNaN(confidence) ? Math.min(100, Math.max(0, confidence)) : 0
  const color = s >= 65 ? '#22B585' : s >= 45 ? '#e3a234' : '#ef5454'
  const circ  = 2 * Math.PI * 22
  return (
    <div className="flex items-center gap-4 shrink-0">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="22" fill="none" stroke="#1a2e1f" strokeWidth="4.5" />
          <circle
            cx="28" cy="28" r="22" fill="none"
            stroke={color} strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - s / 100)}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums" style={{ color }}>
          {s}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-[var(--c-text-faint)] uppercase tracking-[0.12em] font-semibold">Confidence</span>
        <span className="text-xs text-[var(--c-text-faint)]">out of 100</span>
      </div>
    </div>
  )
}

function Skeleton({ showSlowMessage }) {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-5 animate-fade">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[#22B585] animate-pulse" />
        <div className="h-2.5 w-28 rounded-full shimmer" />
      </div>
      <div className="flex gap-4 items-center">
        <div className="w-14 h-14 rounded-full shimmer shrink-0" />
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-3 rounded-full shimmer w-4/5" />
          <div className="h-3 rounded-full shimmer w-3/5" />
          <div className="h-3 rounded-full shimmer w-2/3" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 rounded-xl shimmer" />
        <div className="h-16 rounded-xl shimmer" />
      </div>
      {showSlowMessage && (
        <p className="text-[12px] text-[var(--c-text-faint)] italic mt-1 animate-fade">
          Analysis loading — this can take a few seconds on first visit.
        </p>
      )}
    </div>
  )
}

// Honest unavailable card. The previous copy hardcoded "Penny stocks, ADRs, and
// instruments with insufficient candle history are skipped" — which fires for
// every analysis failure regardless of the actual cause, and is just wrong for
// large-caps like AMD. The new copy adapts to the actual error.
function Unavailable({ ticker, error }) {
  const msg =
    error && /timeout|timed out|504|gateway/i.test(error)
      ? 'Analysis request timed out. Try refreshing — the Groq model can lag on cold starts.'
      : error && /candle|simulated|insufficient.*history/i.test(error)
      ? `Real candle data for ${ticker ?? 'this ticker'} is unavailable right now, so the model has nothing reliable to analyze. Analysis runs again as soon as live OHLC returns.`
      : error
      ? 'Analysis temporarily unavailable. Try refreshing in a moment.'
      : 'Analysis temporarily unavailable. Try refreshing in a moment.'
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-fade">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">AI Analysis</span>
        <span className="text-[9px] font-bold tracking-widest uppercase text-[var(--c-text-faint)] border border-[var(--c-border)] rounded-full px-2 py-0.5">Unavailable</span>
      </div>
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] text-[var(--c-text-fainter)] flex items-center justify-center text-base">i</span>
        <p className="text-sm text-[var(--c-text)]/85 leading-relaxed">{msg}</p>
      </div>
    </div>
  )
}

export default function AIAnalysis({ data, loading, error, asOf }) {
  const [revealError, setRevealError] = useState(false)
  useEffect(() => {
    if (data || loading) { setRevealError(false); return }
    const id = setTimeout(() => setRevealError(true), ERROR_REVEAL_DELAY_MS)
    return () => clearTimeout(id)
  }, [data, loading, error])

  const [slowLoad, setSlowLoad] = useState(false)
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return }
    const id = setTimeout(() => setSlowLoad(true), 3000)
    return () => clearTimeout(id)
  }, [loading])

  if (!data) {
    if (loading || !revealError) return <Skeleton showSlowMessage={slowLoad} />
    return <Unavailable error={error} />
  }

  const isBuy  = data.verdict === 'BUY'
  const isHold = data.verdict === 'HOLD'
  const verdictColor  = isBuy ? '#22B585' : isHold ? '#e3a234' : '#ef5454'
  const verdictLabel  = isBuy ? '▲ BUY' : isHold ? '◆ HOLD' : '▼ SELL'
  const verdictBorder = isBuy  ? 'border-[#22B585]/25 text-[#22B585] bg-[#22B585]/10'
                      : isHold ? 'border-[#e3a234]/25 text-[#e3a234] bg-[#e3a234]/10'
                      : 'border-[#ef5454]/25 text-[#ef5454] bg-[#ef5454]/10'

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-5 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center">
          AI Analysis
          <InfoTooltip>
            Generated by Groq LLaMA-3.3-70B over technical indicators (RSI, MACD, Bollinger bands), recent price action, and fundamentals. Educational only — not financial advice.
          </InfoTooltip>
        </span>
        <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${verdictBorder}`}>
          {verdictLabel}
        </span>
      </div>

      {/* Confidence ring + summary */}
      <div className="flex items-start gap-4">
        <ConfidenceRing confidence={data.confidence} />
        <p className="text-sm text-[var(--c-text)]/80 leading-relaxed flex-1 pt-0.5">{data.summary}</p>
      </div>

      {/* Bull / Bear split */}
      {(data.bullCase || data.bearCase) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.bullCase && (
            <div className="bg-[#22B585]/[0.05] border border-[#22B585]/15 rounded-xl p-3.5 transition-colors hover:border-[#22B585]/25 hover:bg-[#22B585]/[0.08]">
              <p className="text-[10px] text-[#22B585] font-bold uppercase tracking-widest mb-2">Bull Case</p>
              <p className="text-xs text-[var(--c-text)]/60 leading-relaxed">{data.bullCase}</p>
            </div>
          )}
          {data.bearCase && (
            <div className="bg-[#ef5454]/[0.05] border border-[#ef5454]/15 rounded-xl p-3.5 transition-colors hover:border-[#ef5454]/25 hover:bg-[#ef5454]/[0.08]">
              <p className="text-[10px] text-[#ef5454] font-bold uppercase tracking-widest mb-2">Bear Case</p>
              <p className="text-xs text-[var(--c-text)]/60 leading-relaxed">{data.bearCase}</p>
            </div>
          )}
        </div>
      )}

      {/* Bollinger explanation */}
      {data.bollingerExplanation && (
        <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-3.5 transition-colors hover:border-[var(--c-border-strong)]">
          <p className="text-[10px] text-[var(--c-text-faint)] font-bold uppercase tracking-widest mb-1.5">Bollinger Bands</p>
          <p className="text-xs text-[var(--c-text)]/60 leading-relaxed">{data.bollingerExplanation}</p>
        </div>
      )}

      {/* Candle pattern */}
      {data.candlePatternMeaning && (
        <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-3.5 transition-colors hover:border-[var(--c-border-strong)]">
          <p className="text-[10px] text-[var(--c-text-faint)] font-bold uppercase tracking-widest mb-1.5">Candle Pattern</p>
          <p className="text-xs text-[var(--c-text)]/60 leading-relaxed">{data.candlePatternMeaning}</p>
        </div>
      )}

      {/* Trade idea */}
      {data.tradeIdea && (
        <div className="border-l-2 border-[#22B585]/40 pl-4 py-0.5">
          <p className="text-[10px] text-[#22B585] font-bold uppercase tracking-widest mb-1.5">Trade Idea</p>
          <p className="text-sm text-[var(--c-text)]/80 leading-relaxed">{data.tradeIdea}</p>
        </div>
      )}

      {/* Footer — data freshness */}
      {asOf && (
        <div className="flex items-center justify-end pt-3 -mb-1 border-t border-[var(--c-border)]/60">
          <DataTimestamp asOf={asOf} source="Groq" />
        </div>
      )}
    </div>
  )
}
