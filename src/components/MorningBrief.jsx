import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSubscription } from '../hooks/useSubscription'

// Morning Brief hub — the daily-habit anchor for authenticated users.
//
// States, in priority order:
//   1. loading            — fetching / composing
//   2. brief present      — render markdown, free tier sees only first section
//   3. no brief + Pro     — auto-generate on demand (server persists + returns)
//   4. no brief + free    — nudge to browse; auto-generate still runs so the
//                            first section is populated
//   5. no watchlist        — market-only fallback + "add tickers" CTA
//
// Wire once, works for cron-generated OR on-demand briefs — the server
// endpoint transparently handles both.

// Bare-bones markdown renderer for our known emission shape (## headers +
// paragraphs). Deliberately not a full parser — the Groq prompt controls
// the format tightly.
function renderMarkdown(md, { limitToFirstSection = false } = {}) {
  if (!md) return null
  const blocks = md.split('\n\n').map(b => b.trim()).filter(Boolean)
  const rendered = []
  let sectionCount = 0
  for (const block of blocks) {
    const isHeader = block.startsWith('## ')
    if (isHeader) {
      sectionCount += 1
      if (limitToFirstSection && sectionCount > 1) break
    }
    if (isHeader) {
      rendered.push(
        <h3
          key={rendered.length}
          className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#22B585] mt-3 first:mt-0"
        >
          {block.slice(3)}
        </h3>
      )
    } else {
      rendered.push(
        <p
          key={rendered.length}
          className="text-[13.5px] leading-relaxed text-[var(--c-text)]/90"
        >
          {block}
        </p>
      )
    }
  }
  return rendered
}

function Skeleton() {
  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-fade">
      <div className="flex items-center justify-between">
        <div className="h-2.5 w-32 rounded-full shimmer" />
        <div className="h-2.5 w-24 rounded-full shimmer" />
      </div>
      <div className="h-1 w-full rounded-full shimmer" />
      <div className="flex flex-col gap-2">
        <div className="h-2 w-20 rounded-full shimmer" />
        <div className="h-3.5 w-11/12 rounded-full shimmer" />
        <div className="h-3.5 w-4/5 rounded-full shimmer" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-2 w-24 rounded-full shimmer" />
        <div className="h-3.5 w-full rounded-full shimmer" />
        <div className="h-3.5 w-3/5 rounded-full shimmer" />
      </div>
      <p className="text-[11px] text-[var(--c-text-fainter)] italic">
        Composing your morning brief…
      </p>
    </div>
  )
}

function DeltaChip({ wlDelta, spyDelta }) {
  if (wlDelta == null) return null
  const up = wlDelta >= 0
  return (
    <span
      className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest tabular-nums whitespace-nowrap"
      style={{
        color:       up ? '#22B585' : '#ef5454',
        borderColor: up ? 'rgba(34,181,133,0.30)' : 'rgba(239,84,84,0.30)',
        background:  up ? 'rgba(34,181,133,0.10)' : 'rgba(239,84,84,0.10)',
      }}
    >
      Watchlist {up ? '+' : ''}{wlDelta.toFixed(2)}%
      {spyDelta != null && (
        <span className="opacity-70 ml-1.5">
          vs SPY {spyDelta >= 0 ? '+' : ''}{spyDelta.toFixed(2)}%
        </span>
      )}
    </span>
  )
}

export default function MorningBrief() {
  const { user } = useAuth()
  const { isPro } = useSubscription()
  const [brief, setBrief]     = useState(null)
  const [status, setStatus]   = useState('idle') // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState(null)
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!user?.id) { setBrief(null); setStatus('idle'); return }
    // Only attempt on-demand fetch once per session mount — avoids re-composing
    // on every re-render triggered by unrelated state changes.
    if (attemptedRef.current) return
    attemptedRef.current = true

    let cancelled = false
    setStatus('loading')
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('Not authenticated')

        const r = await fetch('/api/insights?kind=morning-brief', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.error ?? `Brief request failed (${r.status})`)
        }
        const { brief: got } = await r.json()
        if (cancelled) return
        setBrief(got)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setErrorMsg(err?.message ?? 'Morning brief unavailable')
        setStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // No brief section for anonymous users — the hero + search covers them.
  if (!user?.id) return null

  if (status === 'loading' || status === 'idle') return <Skeleton />

  if (status === 'error') {
    return (
      <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-2 animate-fade">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em]">
            Morning Brief
          </span>
          <span className="text-[9px] font-bold tracking-widest uppercase text-[var(--c-text-faint)] border border-[var(--c-border)] rounded-full px-2 py-0.5">
            Unavailable
          </span>
        </div>
        <p className="text-[12.5px] text-[var(--c-text)]/85 leading-relaxed">
          Couldn't compose your morning brief right now. Try refreshing in a moment.
        </p>
        <p className="text-[10px] text-[var(--c-text-fainter)]">
          {errorMsg}
        </p>
      </div>
    )
  }

  if (!brief) return null

  const dateLabel = new Date(brief.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })

  // Detect the market-only fallback (no watchlist yet) so we can pair the
  // brief with a "add tickers" nudge.
  const isNoWatchlistFallback = /Personalize this|watchlist/i.test(brief.content_md ?? '')
    && brief.watchlist_change_pct == null

  // Section count — used to build an accurate "N-1 more sections" CTA.
  const totalSections = (brief.content_md?.match(/^## /gm) ?? []).length

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-enter">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.14em] inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22B585]" />
          Morning Brief · {dateLabel}
        </span>
        <DeltaChip wlDelta={brief.watchlist_change_pct} spyDelta={brief.spy_change_pct} />
      </div>

      {/* First section is always visible. Pro users see every section; free
          users see only the first, with an inline upgrade prompt taking
          the place of the remaining sections. Keeps the top item genuinely
          READABLE per the "top item only" spec. */}
      <div className="flex flex-col gap-1.5">
        {renderMarkdown(brief.content_md, { limitToFirstSection: !isPro })}
      </div>

      {/* Free tier: inline upgrade CTA in place of the remaining sections. */}
      {!isPro && totalSections > 1 && (
        <div className="border border-[#22B585]/25 bg-[#22B585]/[0.06] rounded-lg p-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--c-text)]/85 flex-wrap sm:flex-nowrap">
          <span className="text-[#22B585] shrink-0 mt-0.5">✦</span>
          <span className="flex-1 min-w-0">
            <strong className="text-[var(--c-text-strong)]">
              {totalSections - 1} more section{totalSections - 1 === 1 ? '' : 's'} in the full brief
            </strong>
            {' '}— watchlist movers, what to watch today, and the day's risk posture.
          </span>
          <button
            type="button"
            onClick={() => window.location.assign('/pricing')}
            className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.97] text-white font-semibold text-[11.5px] px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0"
          >
            Upgrade to Pro
          </button>
        </div>
      )}

      {/* Nudge for empty-watchlist users regardless of tier — they can't get
          personalized briefs without at least one ticker tracked. */}
      {isNoWatchlistFallback && (
        <div className="border border-[#22B585]/25 bg-[#22B585]/[0.06] rounded-lg p-3 flex items-center gap-2 text-[11.5px] leading-relaxed text-[var(--c-text)]/85">
          <span className="text-[#22B585] shrink-0">→</span>
          <span>
            <strong>Personalize tomorrow's brief.</strong> Add a few tickers to your
            watchlist and Kairo will cover exactly what you own.
          </span>
        </div>
      )}
    </div>
  )
}
