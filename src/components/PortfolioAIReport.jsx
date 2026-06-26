const VERDICT_CONFIG = {
  STRONG:   { color: '#22B585', bg: '#22B585', label: 'Strong' },
  MODERATE: { color: '#e3a234', bg: '#e3a234', label: 'Moderate' },
  WEAK:     { color: '#ef5454', bg: '#ef5454', label: 'Weak'   },
}

const ACTION_CONFIG = {
  ADD:  { color: '#22B585', bg: '#22B58515', border: '#22B58530' },
  HOLD: { color: '#8aab97', bg: '#1a2e1f',   border: '#1a2e1f'   },
  TRIM: { color: '#e3a234', bg: '#e3a23415', border: '#e3a23430' },
  EXIT: { color: '#ef5454', bg: '#ef545415', border: '#ef545430' },
}

function ScoreRing({ score, color }) {
  const r   = 22
  const circ = 2 * Math.PI * r
  const fill = circ * (1 - score / 100)
  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#1a2e1f" strokeWidth="4" />
      <circle
        cx="28" cy="28" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={circ}
        strokeDashoffset={fill}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight="800" fill="#d1d9d5">
        {score}
      </text>
    </svg>
  )
}

export default function PortfolioAIReport({ report, onAnalyzeTicker }) {
  const cfg = VERDICT_CONFIG[report.verdict] ?? VERDICT_CONFIG.MODERATE

  return (
    <div className="flex flex-col gap-4 pt-1 animate-enter">

      {/* Verdict header */}
      <div className="flex items-center gap-4 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-4">
        <ScoreRing score={report.overallScore ?? 0} color={cfg.color} />
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest"
              style={{ color: cfg.color, borderColor: `${cfg.bg}50`, backgroundColor: `${cfg.bg}18` }}
            >
              {cfg.label} Health
            </span>
          </div>
          <p className="text-xs text-[var(--c-text-muted)] leading-relaxed">{report.summary}</p>
        </div>
      </div>

      {/* Strengths + Risks */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-3 flex flex-col gap-2">
          <span className="text-[9px] font-bold text-[#22B585] uppercase tracking-widest">Strengths</span>
          {(report.strengths ?? []).map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[#22B585] text-[10px] mt-0.5 shrink-0">✓</span>
              <p className="text-[11px] text-[var(--c-text-muted)] leading-relaxed">{s}</p>
            </div>
          ))}
        </div>
        <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-3 flex flex-col gap-2">
          <span className="text-[9px] font-bold text-[#ef5454] uppercase tracking-widest">Risks</span>
          {(report.risks ?? []).map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-[#ef5454] text-[10px] mt-0.5 shrink-0">✗</span>
              <p className="text-[11px] text-[var(--c-text-muted)] leading-relaxed">{r}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Holding signals */}
      {report.holdingSignals?.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Holding Signals</span>
          <div className="flex flex-col gap-1.5">
            {report.holdingSignals.map(sig => {
              const ac = ACTION_CONFIG[sig.action] ?? ACTION_CONFIG.HOLD
              return (
                <div key={sig.ticker} className="flex items-start gap-2.5">
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <button
                      onClick={() => onAnalyzeTicker?.(sig.ticker)}
                      className="text-[11px] font-bold text-[var(--c-text)] hover:text-[#22B585] transition-colors w-12 text-left"
                    >
                      {sig.ticker}
                    </button>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-widest shrink-0"
                      style={{ color: ac.color, backgroundColor: ac.bg, borderColor: ac.border }}
                    >
                      {sig.action}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--c-text-faint)] leading-relaxed">{sig.note}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top recommendation */}
      {report.topRecommendation && (
        <div className="bg-[var(--c-input-bg)] border border-[#22B585]/20 rounded-xl p-3 flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[#22B585] uppercase tracking-widest">Top Recommendation</span>
          <p className="text-xs text-[var(--c-text)] leading-relaxed">{report.topRecommendation}</p>
        </div>
      )}

      {/* Rebalance idea */}
      {report.rebalanceIdea && (
        <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-3 flex flex-col gap-1.5">
          <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Rebalance Idea</span>
          <p className="text-xs text-[var(--c-text-muted)] leading-relaxed">{report.rebalanceIdea}</p>
        </div>
      )}
    </div>
  )
}
