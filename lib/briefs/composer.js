// Shared Morning Brief composer. Called from BOTH:
//   • lib/jobs/openBrief.js  — cron at 08:30 ET, weekdays only, emails via Resend
//   • api/insights.js?kind=morning-brief — on-demand client fetch for a signed-in user
//
// Keeping both paths on the same helper guarantees the AI voice and section
// structure stays identical regardless of how the brief was created. Any
// tweak to the prompt or fallback flows through to both surfaces.

const GROQ_API_KEY    = process.env.GROQ_API_KEY
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY

// Broad-market context — futures/ETF proxies for the pre-open framing.
export const MARKET_CONTEXT_SYMBOLS = ['SPY', 'QQQ', 'IWM']

export async function fetchQuote(symbol) {
  if (!FINNHUB_API_KEY) return null
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`)
    if (!r.ok) return null
    const d = await r.json()
    return { symbol, price: d.c ?? null, change: d.d ?? null, changePct: d.dp ?? null }
  } catch { return null }
}

export async function fetchMarketContext() {
  const quotes = await Promise.all(MARKET_CONTEXT_SYMBOLS.map(fetchQuote))
  return quotes.filter(Boolean)
}

// Groq-powered brief, with a deterministic markdown fallback if Groq is
// unavailable or errors. The fallback still produces a legibly-structured
// brief so the UI never has to render an empty state due to upstream issues.
export async function composeBrief({ watchlist, watchlistQuotes, recentVerdicts, marketContext }) {
  if (!GROQ_API_KEY) {
    return basicBrief({ watchlist, watchlistQuotes, marketContext })
  }

  const wlCtx = watchlistQuotes.length
    ? watchlistQuotes.map(q =>
        `${q.symbol}: ${q.price != null ? `$${q.price.toFixed(2)}` : '—'} (${q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—'})`
      ).join('; ')
    : 'No watchlist yet'

  const mkCtx = marketContext.map(q =>
    `${q.symbol} ${q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—'}`
  ).join(', ')

  const recentCtx = (recentVerdicts ?? []).slice(0, 5).map(v =>
    `${v.ticker} ${v.verdict} @ ${v.confidence}% conf`
  ).join('; ') || 'no recent verdicts'

  // When a user has no watchlist yet we ask the model to write a lean
  // general-market brief plus a nudge to add tickers — matches the Phase 2
  // spec: "If the user has no watchlist yet, prompt them to add stocks,
  // and show a general market brief in the meantime."
  const noWatchlist = watchlistQuotes.length === 0

  const prompt = noWatchlist
    ? `You are writing a general morning markets brief for a new Kairo user who hasn't added anything to their watchlist yet.

Today's market context: ${mkCtx}

Write a tight, professional brief in markdown — 3 sections:
1. "## Market context" — 1-2 sentences on what the major indices are doing pre-market.
2. "## Watch today" — 1-2 sentences on notable macro or sector rotation to watch.
3. "## Personalize this" — 1 sentence encouraging them to add tickers to their watchlist so tomorrow's brief covers what they own.

Rules: No disclaimers, no "as an AI", no hedging. Be specific and confident. Cite numbers from the context above. Max ~120 words total. Use markdown headers exactly as "## Section name".`
    : `You are writing a personalized morning markets brief for a Kairo user.

Today's market context: ${mkCtx}
User's watchlist movers (pre-market): ${wlCtx}
User's last 5 Kairo verdicts: ${recentCtx}

Write a tight, professional brief in markdown — 4 sections:
1. "## Market context" — 1 sentence on what futures and macros are doing.
2. "## Your watchlist" — 1-2 sentences on the most interesting mover in their list, naming the ticker and % move.
3. "## Watch today" — 1-2 specific names from their watchlist or recent verdicts and what could matter (RSI level, earnings, technical inflection).
4. "## Today's setup" — 1 sentence on the overall risk posture (risk-on vs risk-off given the tape).

Rules: No disclaimers, no "as an AI", no hedging. Be specific and confident. Cite numbers from the context above. Max ~140 words total. Use markdown headers exactly as "## Section name".`

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body:    JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    })
    if (!r.ok) return basicBrief({ watchlist, watchlistQuotes, marketContext })
    const json = await r.json()
    const md   = json.choices?.[0]?.message?.content?.trim()
    return md || basicBrief({ watchlist, watchlistQuotes, marketContext })
  } catch {
    return basicBrief({ watchlist, watchlistQuotes, marketContext })
  }
}

export function basicBrief({ watchlist, watchlistQuotes, marketContext }) {
  const mk = marketContext.map(q =>
    `${q.symbol} ${q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '—'}`
  ).join(', ')
  if (!watchlistQuotes.length) {
    return `## Market context\n${mk || 'Market context unavailable right now.'}\n\n## Personalize this\nAdd tickers to your watchlist so tomorrow morning's brief covers what you actually own.`
  }
  const wl = watchlistQuotes.slice(0, 3).map(q =>
    `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct?.toFixed(2) ?? '—'}%`
  ).join(', ')
  return `## Market context\n${mk}\n\n## Your watchlist\n${wl}`
}

// Convenience helper that gathers all the input data for a user by user id.
// Used only by the on-demand endpoint; the cron already fans out over
// profiles and gathers this data itself.
export async function gatherBriefInputs(supabase, userId) {
  const [watchlistRes, verdictsRes, marketContext] = await Promise.all([
    supabase.from('watchlists').select('ticker').eq('user_id', userId),
    supabase.from('verdict_history').select('ticker, verdict, confidence').eq('user_id', userId).order('viewed_at', { ascending: false }).limit(5),
    fetchMarketContext(),
  ])
  const watchlistTickers = (watchlistRes.data ?? []).map(w => w.ticker)
  const watchlistQuotes  = (await Promise.all(watchlistTickers.slice(0, 10).map(fetchQuote))).filter(q => q && q.changePct != null)
  const recentVerdicts   = verdictsRes.data ?? []
  return { watchlist: watchlistTickers, watchlistQuotes, recentVerdicts, marketContext }
}

// Persist a brief for a user + date + kind. Also returns aggregate deltas
// used by the UI's summary chip (watchlist avg vs SPY).
export async function persistBrief(supabase, { userId, kind, date, contentMd, watchlistQuotes, marketContext }) {
  const wlAvg = watchlistQuotes.length
    ? watchlistQuotes.reduce((sum, q) => sum + q.changePct, 0) / watchlistQuotes.length
    : null
  const spyChange = marketContext.find(q => q.symbol === 'SPY')?.changePct ?? null

  const { data, error } = await supabase.from('daily_briefs').insert({
    user_id: userId,
    kind,
    date,
    content_md:           contentMd,
    watchlist_change_pct: wlAvg,
    spy_change_pct:       spyChange,
  }).select().single()
  return { row: data, error, wlAvg, spyChange }
}
