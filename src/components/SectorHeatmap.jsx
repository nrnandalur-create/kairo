import { useState, useEffect, useCallback } from 'react'

const SECTORS = [
  { etf: 'XLK',  name: 'Technology'            },
  { etf: 'XLV',  name: 'Healthcare'             },
  { etf: 'XLF',  name: 'Financials'             },
  { etf: 'XLE',  name: 'Energy'                 },
  { etf: 'XLY',  name: 'Consumer Discr.'        },
  { etf: 'XLI',  name: 'Industrials'            },
  { etf: 'XLU',  name: 'Utilities'              },
  { etf: 'XLB',  name: 'Materials'              },
  { etf: 'XLRE', name: 'Real Estate'            },
  { etf: 'XLC',  name: 'Communication'          },
]

// Returns bg / border / text colors scaled to magnitude (saturates at ±3%)
function heatColors(pct) {
  if (pct == null) return { bg: '#0f1611', border: '#1a2e1f', text: '#4b6358' }
  const t = Math.min(Math.abs(pct) / 3, 1)
  if (pct >= 0) {
    return {
      bg:     `rgba(29,158,117,${0.07 + t * 0.20})`,
      border: `rgba(29,158,117,${0.18 + t * 0.35})`,
      text:   `rgb(${Math.round(100 - t * 50)},${Math.round(220 - t * 60)},${Math.round(180 - t * 50)})`,
    }
  }
  return {
    bg:     `rgba(226,75,74,${0.07 + t * 0.20})`,
    border: `rgba(226,75,74,${0.18 + t * 0.35})`,
    text:   `rgb(${Math.round(240 - t * 30)},${Math.round(110 - t * 70)},${Math.round(90 - t * 60)})`,
  }
}

export default function SectorHeatmap({ open, onClose, onAnalyze }) {
  const [quotes, setQuotes]   = useState([])
  const [loading, setLoading] = useState(false)
  const [updated, setUpdated] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const syms = SECTORS.map(s => s.etf).join(',')
      const r = await fetch(`/api/quotes?symbols=${syms}`)
      const d = await r.json()
      setQuotes(d.quotes ?? [])
      setUpdated(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [open, load])

  if (!open) return null

  const sectors = SECTORS.map(s => {
    const q = quotes.find(x => x.symbol === s.etf)
    return { ...s, price: q?.price ?? null, changePct: q?.changePct ?? null }
  }).sort((a, b) => (b.changePct ?? -99) - (a.changePct ?? -99))

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl bg-[var(--c-bg)] border-l border-[var(--c-border)] flex flex-col h-full"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Sector Heatmap</span>
            {updated && (
              <span className="text-[10px] text-[var(--c-text-fainter)]">
                {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {loading && (
              <div className="w-3 h-3 rounded-full border border-transparent border-t-[#22B585] animate-spin" />
            )}
          </div>
          <button onClick={onClose} className="text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors p-1 cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2.5">
            {sectors.map(s => {
              const { bg, border, text } = heatColors(s.changePct)
              const up = (s.changePct ?? 0) >= 0
              const barW = s.changePct != null
                ? Math.min(Math.abs(s.changePct) / 3 * 100, 100)
                : 0

              return (
                <button
                  key={s.etf}
                  onClick={() => { onClose(); onAnalyze(s.etf) }}
                  style={{ background: bg, borderColor: border }}
                  className="border rounded-xl p-4 text-left flex flex-col gap-2.5 hover:brightness-110 active:scale-[0.98] transition-all duration-100 cursor-pointer"
                >
                  {/* Top row: ETF + pct */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">{s.etf}</span>
                    {s.changePct != null ? (
                      <span className="text-xs font-black tabular-nums" style={{ color: text }}>
                        {up ? '+' : ''}{s.changePct.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--c-text-fainter)]">—</span>
                    )}
                  </div>

                  {/* Sector name + price */}
                  <div>
                    <div className="text-sm font-semibold text-[var(--c-text)] leading-tight">{s.name}</div>
                    <div className="text-[11px] text-[var(--c-text-faint)] tabular-nums mt-0.5">
                      {s.price != null ? `$${s.price.toFixed(2)}` : '—'}
                    </div>
                  </div>

                  {/* Magnitude bar */}
                  <div className="h-[3px] bg-[var(--c-input-bg)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${barW}%`, background: up ? '#22B585' : '#ef5454' }}
                    />
                  </div>
                </button>
              )
            })}
          </div>

          <p className="text-[10px] text-[var(--c-text-fainter)] text-center mt-5 leading-relaxed">
            Click any sector to analyze the ETF · Sorted by today's performance · Auto-refreshes every 60s
          </p>
        </div>
      </div>
    </div>
  )
}
