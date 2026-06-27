import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Lightweight markdown → JSX for our brief format (## headers + paragraphs).
// Deliberately bare-bones — we control what the AI emits, so we don't need a
// full markdown parser dependency.
function renderMarkdown(md) {
  if (!md) return null
  return md.split('\n\n').map((block, i) => {
    const t = block.trim()
    if (t.startsWith('## ')) {
      return (
        <h3 key={i} className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#22B585] mt-3 first:mt-0">
          {t.slice(3)}
        </h3>
      )
    }
    return (
      <p key={i} className="text-[13.5px] leading-relaxed text-[var(--c-text)]/90">
        {t}
      </p>
    )
  })
}

// In-app surface for today's Open Brief / Close Wrap. Renders the latest
// `kind` ('open' or 'close') for the signed-in user; renders nothing if
// nothing's been composed yet today.
export default function DailyBriefCard({ userId, kind = 'open', onJumpToTicker }) {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('daily_briefs')
      .select('id, kind, date, content_md, watchlist_change_pct, spy_change_pct, created_at')
      .eq('user_id', userId)
      .eq('kind', kind)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setBrief(data) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, kind])

  if (!userId || loading || !brief) return null

  const dateLabel = new Date(brief.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
  const wlDelta  = brief.watchlist_change_pct
  const spyDelta = brief.spy_change_pct
  const eyebrow  = kind === 'open' ? 'Open Brief' : 'Close Wrap'

  return (
    <div className="w-full glass-card rounded-2xl p-6 flex flex-col gap-4 animate-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em]">
          {eyebrow} · {dateLabel}
        </span>
        {wlDelta != null && (
          <span
            className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest tabular-nums"
            style={{
              color:        wlDelta >= 0 ? '#22B585' : '#ef5454',
              borderColor:  wlDelta >= 0 ? 'rgba(34,181,133,0.3)' : 'rgba(239,84,84,0.3)',
              background:   wlDelta >= 0 ? 'rgba(34,181,133,0.1)' : 'rgba(239,84,84,0.1)',
            }}
          >
            Watchlist {wlDelta >= 0 ? '+' : ''}{wlDelta.toFixed(2)}%
            {spyDelta != null && (
              <span className="opacity-70 ml-1.5">vs SPY {spyDelta >= 0 ? '+' : ''}{spyDelta.toFixed(2)}%</span>
            )}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {renderMarkdown(brief.content_md)}
      </div>
    </div>
  )
}
