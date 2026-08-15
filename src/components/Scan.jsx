import { useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from './EmptyState'
import ErrorCard from './ErrorCard'
import { supabase } from '../lib/supabase'
import sp500 from '../data/sp500.json' with { type: 'json' }

const SECTORS = [...new Set(sp500.map(s => s.sector))].sort()
const TICK_INTERVAL_MS = 800

function today() {
  return new Date().toISOString().slice(0, 10)
}

const rsiColor = v => v <= 20 ? '#22B585' : '#27c490'

function StockCard({ stock, onSelect }) {
  return (
    <div
      onClick={() => onSelect(stock.ticker)}
      className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-4 flex flex-col gap-3 cursor-pointer hover:border-[var(--c-border-strong)] hover:bg-[var(--c-hover-bg)] transition-all duration-150 animate-enter"
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sm font-bold text-[var(--c-text)] shrink-0">{stock.ticker}</span>
          <span className="text-xs text-[var(--c-text-faint)] truncate min-w-0">{stock.name}</span>
        </div>
        <span className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest truncate self-start max-w-full">
          {stock.sector}
        </span>
      </div>
      <div className="flex items-end justify-between pt-1 border-t border-[var(--c-border)]">
        <span className="text-2xl font-black tabular-nums text-[var(--c-text)] leading-none">
          ${stock.price?.toFixed(2) ?? '—'}
        </span>
        <div className="text-right">
          <p className="text-[9px] text-[var(--c-text-faint)] uppercase tracking-widest mb-0.5">RSI (14)</p>
          <p className="text-lg font-bold tabular-nums leading-none" style={{ color: rsiColor(stock.rsi) }}>
            {stock.rsi}
          </p>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-xl p-4 flex flex-col gap-3">
      <div className="flex justify-between">
        <div className="h-3 w-20 rounded-full shimmer" />
        <div className="h-3 w-14 rounded-full shimmer" />
      </div>
      <div className="h-7 w-24 rounded-full shimmer" />
    </div>
  )
}

export default function Scan({ open, onClose, onAnalyze }) {
  const [status, setStatus]           = useState('idle') // idle | running | done | error
  const [results, setResults]         = useState([])
  const [lastScannedAt, setLastScannedAt] = useState(null)
  const [meta, setMeta]               = useState({ total: 0, processed: 0, failedCount: 0 })
  const [sector, setSector]           = useState(null)
  const [error, setError]             = useState(null)
  const [mounted, setMounted]         = useState(false)
  const cancelledRef = useRef(false)

  // Drives the slide-in entrance — starts translated off-screen, flips to
  // translate-x-0 one frame after mount so the transition actually plays.
  useEffect(() => {
    if (!open) { setMounted(false); return }
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  const loadResults = async () => {
    const [{ data: job }, { data: rows }] = await Promise.all([
      supabase.from('scan_jobs').select('*').eq('scan_date', today())
        .order('started_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('scan_results').select('ticker, company_name, sector, price, rsi')
        .eq('scan_date', today()).lte('rsi', 30).order('rsi', { ascending: true }),
    ])
    setResults((rows ?? []).map(r => ({ ticker: r.ticker, name: r.company_name, sector: r.sector, price: r.price, rsi: r.rsi })))
    if (job) {
      setLastScannedAt(job.completed_at)
      setMeta({ total: job.total, processed: job.processed, failedCount: job.failed_count })
    }
    return job
  }

  const pollUntilDone = async (jobId) => {
    cancelledRef.current = false
    while (!cancelledRef.current) {
      const r = await fetch('/api/screener?type=scan-tick', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`)
      const tick = await r.json()
      setMeta({ total: tick.total, processed: tick.processed, failedCount: tick.failedCount })
      if (tick.status === 'done') break
      await new Promise(resolve => setTimeout(resolve, TICK_INTERVAL_MS))
    }
  }

  const runScan = async (force = false) => {
    setStatus('running')
    setError(null)
    try {
      const r = await fetch('/api/screener?type=scan-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`)
      const started = await r.json()
      if (started.status !== 'done') await pollUntilDone(started.jobId)
      await loadResults()
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  // On open, check whether today's scan already ran (or is mid-flight).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const job = await loadResults()
      if (cancelled) return
      if (job?.status === 'done') setStatus('done')
      else if (job?.status === 'running') { setStatus('running'); await pollUntilDone(job.id); if (!cancelled) { await loadResults(); setStatus('done') } }
    })()
    return () => { cancelled = true; cancelledRef.current = true }
  }, [open])

  const filtered = useMemo(
    () => sector ? results.filter(r => r.sector === sector) : results,
    [results, sector]
  )

  if (!open) return null

  const hasScannedToday = status === 'done' || status === 'running'
  const pct = meta.total > 0 ? Math.min(100, Math.round((meta.processed / meta.total) * 100)) : 0

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className={`flex-1 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`w-full max-w-xl h-full bg-[var(--c-card)] border-l border-[var(--c-border-strong)] shadow-[-16px_0_48px_-8px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden transition-transform duration-200 ease-out ${mounted ? 'translate-x-0' : 'translate-x-full'}`}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--c-border)] shrink-0">
          <div>
            <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">S&P 500 RSI Scan</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => runScan(hasScannedToday)}
              disabled={status === 'running'}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-[#22B585] text-white hover:bg-[#27c490] active:scale-[0.97] transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              {status === 'running' ? 'Scanning…' : hasScannedToday ? 'Force Refresh' : 'Scan Now'}
            </button>
            <button onClick={onClose} className="text-[var(--c-text-faint)] hover:text-[var(--c-text)] transition-colors p-1">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Sector filter */}
        <div className="px-6 py-4 flex flex-col gap-2 border-b border-[var(--c-border)] shrink-0">
          <p className="text-[9px] font-bold text-[var(--c-text-faint)] uppercase tracking-widest">Sector</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSector(null)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                sector === null
                  ? 'bg-[#22B585] text-white border-[#22B585]'
                  : 'bg-[var(--c-input-bg)] text-[var(--c-text-faint)] border-[var(--c-border)] hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]'
              }`}
            >
              All
            </button>
            {SECTORS.map(s => (
              <button
                key={s}
                onClick={() => setSector(s)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                  sector === s
                    ? 'bg-[#22B585] text-white border-[#22B585]'
                    : 'bg-[var(--c-input-bg)] text-[var(--c-text-faint)] border-[var(--c-border)] hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3 min-h-[18px]">
            {status === 'running' ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22B585] animate-pulse" />
                <p className="text-[10px] text-[var(--c-text-faint)]">Scanning {meta.processed} / {meta.total} ({pct}%)…</p>
              </div>
            ) : status === 'done' ? (
              <p className="text-[10px] text-[var(--c-text-faint)]">
                {filtered.length} oversold · last scanned {lastScannedAt ? new Date(lastScannedAt).toLocaleTimeString() : '—'}
                {meta.failedCount > 0 && ` · ${meta.failedCount} unavailable`}
              </p>
            ) : status === 'error' ? null : (
              <p className="text-[10px] text-[var(--c-text-faint)]">RSI(14) ≤ 30 across the S&amp;P 500 · click Scan Now</p>
            )}
          </div>

          {status === 'error' ? (
            <ErrorCard message={error} onRetry={() => runScan(hasScannedToday)} />
          ) : status === 'running' && results.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : status === 'idle' ? (
            <EmptyState
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M1.5 3.5h13M4 8h8M6.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              }
              title="No scan yet today"
              body="Run a scan to find S&P 500 stocks with RSI(14) at or below 30 — a classic oversold signal."
              action={{ label: 'Scan Now', onClick: () => runScan(false) }}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No oversold names"
              body={sector ? `Nothing in ${sector} is oversold right now.` : 'Nothing in the S&P 500 is oversold right now.'}
              action={sector ? { label: 'Clear sector filter', onClick: () => setSector(null) } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filtered.map(stock => (
                <StockCard key={stock.ticker} stock={stock} onSelect={sym => { onClose(); onAnalyze(sym) }} />
              ))}
            </div>
          )}
        </div>

        {/* Disclaimer */}
        <div className="px-6 py-3 border-t border-[var(--c-border)] shrink-0">
          <p className="text-[10px] text-[var(--c-text-faint)] leading-relaxed">
            RSI &lt; 30 is a technical signal only, not investment advice. Not a recommendation to buy or sell.
          </p>
        </div>
      </div>
    </div>
  )
}
