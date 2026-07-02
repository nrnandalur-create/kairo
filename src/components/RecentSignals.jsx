import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// Recent Signals — the in-app surface for smart alerts the cron already
// fires and emails. Renders the last 5 fires for the signed-in user with
// a one-tap "Open ticker" affordance. Silent when the user has nothing
// yet (no confusing empty card on brand-new accounts).

const KIND_META = {
  bb_break:        { label: 'Bollinger Break', color: '#e3a234', glyph: '⇋' },
  rsi_extreme:     { label: 'RSI Extreme',     color: '#e3a234', glyph: '≶' },
  earnings_primer: { label: 'Earnings Soon',   color: '#22B585', glyph: '◈' },
  signal_flipped:  { label: 'Signal Flipped',  color: '#22B585', glyph: '↺' },
  take_profits:    { label: 'Take Profits?',   color: '#22B585', glyph: '$' },
  stop_hit:        { label: 'Stop Triggered',  color: '#ef5454', glyph: '⚠' },
  macro_impact:    { label: 'Macro Event',     color: '#e3a234', glyph: '⌘' },
}

function fmtWhen(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diffMin = Math.max(1, Math.round((Date.now() - then) / 60_000))
  if (diffMin < 60)   return `${diffMin}m ago`
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`
  return `${Math.round(diffMin / 1440)}d ago`
}

// One row per signal. Whole row is a button — clicking routes to the
// ticker's full analysis page (respects the ticker-page normal flow).
function SignalRow({ signal, onOpenTicker }) {
  const meta = KIND_META[signal.kind] ?? { label: signal.kind, color: 'var(--c-text-faint)', glyph: '•' }
  const context = signal.context ?? {}
  const contextLine =
    signal.kind === 'bb_break'        ? (context.side === 'lower' ? `Closed $${Number(context.close).toFixed(2)} under band $${Number(context.band).toFixed(2)}` : `Closed $${Number(context.close).toFixed(2)} over band $${Number(context.band).toFixed(2)}`)
  : signal.kind === 'rsi_extreme'     ? (context.side === 'oversold' ? `RSI dropped to ${Number(context.rsi).toFixed(1)}` : `RSI climbed to ${Number(context.rsi).toFixed(1)}`)
  : signal.kind === 'earnings_primer' ? `Reports ${context.date}${context.days_away === 0 ? ' today' : ` in ${context.days_away}d`}`
  : signal.kind === 'signal_flipped'  ? `${context.from} → ${context.to}`
  : signal.kind === 'take_profits'    ? `+${Number(context.gain_pct).toFixed(1)}% vs cost, verdict softened`
  : ''

  return (
    <button
      type="button"
      onClick={() => onOpenTicker?.(signal.ticker)}
      className="w-full flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg text-left hover:bg-[var(--c-hover-bg)] transition-colors duration-150 cursor-pointer"
      title={`Open ${signal.ticker}`}
    >
      <span
        className="mt-0.5 shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black"
        style={{
          color:           meta.color,
          border:          `1px solid ${meta.color}40`,
          backgroundColor: `${meta.color}12`,
        }}
      >
        {meta.glyph}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-[12.5px] font-black text-[var(--c-text)] tracking-[0.04em]">
            {signal.ticker}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
        {contextLine && (
          <span className="text-[11.5px] text-[var(--c-text)]/75 truncate">{contextLine}</span>
        )}
      </div>
      <span className="text-[10px] text-[var(--c-text-fainter)] tabular-nums shrink-0 mt-1">
        {fmtWhen(signal.fired_at)}
      </span>
    </button>
  )
}

export default function RecentSignals({ onOpenTicker }) {
  const { user } = useAuth()
  const [signals, setSignals] = useState(null)

  useEffect(() => {
    if (!user?.id) { setSignals(null); return }
    let cancelled = false
    supabase
      .from('smart_signals_sent')
      .select('id, ticker, kind, context, fired_at')
      .eq('user_id', user.id)
      .order('fired_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (!cancelled) setSignals(data ?? []) })
    return () => { cancelled = true }
  }, [user?.id])

  // Silent when unauthenticated or no signals yet — the landing view already
  // has the Morning Brief + Movers as the front door; empty RecentSignals
  // would just add noise.
  if (!user?.id || !signals || signals.length === 0) return null

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#e3a234]" />
          Recent Signals
        </span>
        <span className="text-[10px] text-[var(--c-text-fainter)]">
          Kairo watching {signals.length === 5 ? '5+' : signals.length} event{signals.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex flex-col">
        {signals.map(s => (
          <SignalRow key={s.id} signal={s} onOpenTicker={onOpenTicker} />
        ))}
      </div>
    </div>
  )
}
