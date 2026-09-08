import { rateLimit } from '../lib/rateLimit.js'
import { validateTicker } from '../lib/validate.js'
import { requireUser, getSupabaseAdmin } from '../lib/auth.js'
import { getEntitlement } from '../lib/entitlements.js'
import { consumeAnalyzeQuota } from '../lib/quota.js'
import { buildDecision } from '../lib/decisionEngine.js'

// Translate an atomic-quota denial into the structured 429 the client expects:
//   { error: 'quota_exceeded', quota: 'verdict'|'search', limit, remaining }
function sendQuotaExceeded(res, decision) {
  return res.status(429).json({
    error:     'quota_exceeded',
    quota:     decision.quota,
    limit:     decision.limit,
    remaining: decision.remaining,
  })
}

function fmtCap(n) {
  if (!n) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

// How many of the core technical indicators (RSI, MACD, Bollinger Bands) came
// back with a real value. Used by the trust guard below to decide whether a
// verdict is defensible at all.
function countTechnicals(indicators) {
  if (!indicators) return 0
  let n = 0
  if (indicators.rsi != null) n++
  if (indicators.macd)        n++
  if (indicators.bb)          n++
  return n
}

// The verdict is only allowed to run when a MEANINGFUL subset of real technical
// data exists — at least one of RSI / MACD / Bollinger Bands. `noTechnicals`
// (set by the client when candles are synthetic) is a hard veto regardless.
function hasCoreTechnicals(indicators, noTechnicals) {
  if (noTechnicals) return false
  return countTechnicals(indicators) >= 1
}

// ── Shared context builder ──────────────────────────────────────────────────
// Both prompts see the SAME numbers; only interpretation and format differ.
// Extracted here so the two prompts can't diverge on the underlying data.
function buildContext({ ticker, quote, profile, metrics, indicators, recentCandles, noTechnicals }) {
  const { bb, rsi, macd } = indicators ?? {}

  const bbZone = bb
    ? bb.pct >= 80 ? `UPPER band (${bb.pct}%) — overbought warning`
    : bb.pct <= 20 ? `LOWER band (${bb.pct}%) — oversold, potential bounce`
    : `MIDDLE band (${bb.pct}%) — neutral`
    : 'N/A'
  const bbLine = bb
    ? `Lower $${bb.lower} | Upper $${bb.upper} | Price at ${bbZone}`
    : 'Insufficient data'

  const rsiLine = rsi != null
    ? `${rsi} — ${rsi >= 70 ? 'overbought (bearish signal)' : rsi <= 30 ? 'oversold (bullish signal)' : 'neutral range'}`
    : 'N/A'

  const macdLine = macd
    ? `MACD ${macd.value} / Signal ${macd.signal} — ${macd.bullish ? 'MACD above signal (bullish momentum)' : 'MACD below signal (bearish momentum)'}`
    : 'N/A'

  const hi52 = metrics?.metric?.['52WeekHigh']
  const lo52 = metrics?.metric?.['52WeekLow']
  const pctFromHi = hi52 ? (((quote.c - hi52) / hi52) * 100).toFixed(1) : null
  const pctFromLo = lo52 ? (((quote.c - lo52) / lo52) * 100).toFixed(1) : null
  const rangeCtx = hi52 && lo52
    ? `$${lo52.toFixed(2)} – $${hi52.toFixed(2)} (price is ${pctFromHi}% from 52W high, +${pctFromLo}% from 52W low)`
    : 'N/A'

  // Volume trend — last-bar volume vs 20-bar avg. Emitted only when we have
  // enough candles; the detailed prompt uses this to talk about volume
  // confluence with the price move.
  let volumeTrend = 'N/A'
  if (Array.isArray(recentCandles) && recentCandles.length >= 5) {
    const vols = recentCandles.map(c => c.volume).filter(v => v > 0)
    if (vols.length) {
      const last  = vols[vols.length - 1]
      const avg   = vols.reduce((a, b) => a + b, 0) / vols.length
      const ratio = avg > 0 ? last / avg : null
      if (ratio != null) {
        volumeTrend = ratio >= 1.5 ? `${ratio.toFixed(2)}× avg — above average (conviction)`
                    : ratio <= 0.7 ? `${ratio.toFixed(2)}× avg — below average (weak participation)`
                    : `${ratio.toFixed(2)}× avg — normal range`
      }
    }
  }

  const priceChange5d = quote.priceChange5d ?? 'N/A'

  return {
    ticker,
    companyName:    profile?.name ?? ticker,
    industry:       profile?.finnhubIndustry ?? 'Unknown',
    marketCap:      fmtCap(profile?.marketCapitalization),
    quote,
    priceChange5d,
    rsiLine,
    macdLine,
    bbLine,
    bbZone,
    rangeCtx,
    volumeTrend,
    pe:             metrics?.metric?.peBasicExclExtraTTM,
    epsGrowth5Y:    metrics?.metric?.epsGrowth5Y,
    beta:           metrics?.metric?.beta,
    hi52,
    lo52,
    noTechnicals: !!noTechnicals,
    recentCandles: Array.isArray(recentCandles) ? recentCandles : [],
  }
}

// ── DETAILED ANALYSIS prompt (feeds the AIAnalysis panel) ───────────────────
// Optimised for a specialist's technical workup — per-indicator readings
// + confluence + range/fundamental context. Explicitly told NOT to give a
// verdict or entry/stop targets — that's the verdict prompt's territory.
function buildAnalysisPrompt(ctx) {
  const candleRows = (ctx.recentCandles ?? []).slice(-5).map(c =>
    `  ${new Date(c.time * 1000).toISOString().slice(0, 10)}: C=${c.close.toFixed(2)} V=${(c.volume / 1e6).toFixed(1)}M`
  ).join('\n')

  const techNote = ctx.noTechnicals
    ? '\n\n⚠️ NO RELIABLE TECHNICAL DATA. For every indicator field below, return the literal string "unavailable" instead of a reading. Fill only the fundamental + range fields.\n'
    : ''

  return `You are a senior technical analyst preparing a specialist's report. Return ONLY a valid JSON object.${techNote}

TICKER: ${ctx.ticker}
COMPANY: ${ctx.companyName}
INDUSTRY: ${ctx.industry}
MARKET CAP: ${ctx.marketCap}
PRICE: $${ctx.quote.c} (${ctx.quote.dp > 0 ? '+' : ''}${Number(ctx.quote.dp).toFixed(2)}% today, 5d: ${ctx.priceChange5d}%)

INDICATOR READINGS:
- RSI (14):    ${ctx.rsiLine}
- MACD:        ${ctx.macdLine}
- BB (20, 2σ): ${ctx.bbLine}
- 52-week:     ${ctx.rangeCtx}
- Volume:      ${ctx.volumeTrend}

FUNDAMENTALS:
- P/E (TTM): ${ctx.pe != null ? ctx.pe.toFixed(1) : 'N/A'}
- EPS growth 5Y: ${ctx.epsGrowth5Y != null ? ctx.epsGrowth5Y.toFixed(1) + '%' : 'N/A'}
- Beta: ${ctx.beta != null ? ctx.beta.toFixed(2) : 'N/A'}

RECENT CANDLES (last 5):
${candleRows}

STYLE RULES — enforced strictly:
- Each indicator field is 1-2 sentences ONLY on that indicator in isolation. Do NOT reference other indicators inside these fields.
- DO NOT give a verdict, entry, or stop-loss anywhere in this response — a separate strategist handles that.
- indicatorConfluence: 1-2 sentences on how the indicators AGREE or CONTRADICT each other explicitly.
- rangeContext: 1-2 sentences on where price sits in the 52W range and what that means for reward vs risk.
- fundamentalContext: 1 sentence on P/E vs peers or growth vs valuation. Skip if all fundamentals are N/A.
- Cite specific numbers in every field. No hedge words when the data is clear.
- Total across all string fields: 150–250 words.

Return ONLY this JSON with no markdown fences:
{
  "rsiAnalysis":         "<1-2 sentences on RSI reading alone.>",
  "macdAnalysis":        "<1-2 sentences on MACD reading alone.>",
  "bbAnalysis":          "<1-2 sentences on Bollinger Bands reading alone.>",
  "vwapAnalysis":        "<1 sentence on price vs its typical intraday level.>",
  "volumeAnalysis":      "<1-2 sentences on volume trend vs the 20-bar average.>",
  "indicatorConfluence": "<1-2 sentences on where the indicators agree vs contradict.>",
  "rangeContext":        "<1-2 sentences on 52W range position and its risk/reward implication.>",
  "fundamentalContext":  "<1 sentence on P/E, EPS growth, or market-cap tier. Or empty string if all N/A.>"
}`
}

// ── Follow-up prompt (streaming, feeds AIChat) ──────────────────────────────
// Consolidated in here to keep the app under Vercel's Hobby 12-function cap.
// Streaming SSE relay from Groq. Different call signature than the two JSON
// prompts above, so it gets its own handler below.
const MAX_QUESTION_LEN = 400
const MAX_HISTORY      = 6

function buildFollowupPrompt({ ticker, context, history, question }) {
  const ctxLines = context ? [
    `PRIOR ANALYSIS:`,
    `Verdict: ${context.verdict ?? 'N/A'}`,
    `Confidence: ${context.confidence ?? 'N/A'}/100`,
    `Risk: ${context.riskLevel ?? 'N/A'}`,
    `Summary: ${context.summary ?? 'N/A'}`,
    context.bullCase  ? `Bull case: ${context.bullCase}`  : null,
    context.bearCase  ? `Bear case: ${context.bearCase}`  : null,
    context.tradeIdea ? `Trade idea: ${context.tradeIdea}` : null,
  ].filter(Boolean).join('\n') : ''

  const histLines = (history ?? [])
    .slice(-MAX_HISTORY)
    .map(t => `${t.role === 'user' ? 'USER' : 'ANALYST'}: ${t.content}`)
    .join('\n')

  return [
    `You are continuing a conversation with a user about ${ticker}. Stay strictly focused on this ticker and the data already provided. Do not hallucinate prices, fundamentals, or news you don't have.`,
    '',
    ctxLines,
    histLines ? `\nCONVERSATION SO FAR:\n${histLines}` : '',
    `\nUSER FOLLOW-UP: ${question}`,
    '',
    `Answer in plain prose — 2–4 sentences, conversational but precise. Cite specific values from the prior analysis where relevant. If the user asks for a number you don't have, say so explicitly. End with NO disclaimers; the surrounding UI already handles that.`,
  ].filter(Boolean).join('\n')
}

async function handleFollowup(req, res) {
  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service unavailable' })

  const ticker = validateTicker(req.body?.ticker)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker' })

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : ''
  if (!question)                          return res.status(400).json({ error: 'Question required' })
  if (question.length > MAX_QUESTION_LEN) return res.status(400).json({ error: 'Question too long' })

  const history = Array.isArray(req.body?.history) ? req.body.history : []
  const context = req.body?.context ?? null
  const prompt  = buildFollowupPrompt({ ticker, context, history, question })

  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort('analyze-followup:timeout'), 12000)

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        stream: true,
        messages: [
          { role: 'system', content: 'You are an institutional equity analyst answering follow-up questions about a single ticker. Be specific, cite numbers from the prior analysis when possible, never invent data, and keep responses to 2–4 sentences. No markdown fences, no headers, no bullet lists — flowing prose only.' },
          { role: 'user',   content: prompt },
        ],
      }),
      signal: abort.signal,
    })

    if (!groqRes.ok) {
      clearTimeout(timeoutId)
      return res.status(502).json({ error: `AI service error (${groqRes.status})` })
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')

    const reader  = groqRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''
    let wroteAny  = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') { res.end(); return }
        try {
          const json  = JSON.parse(data)
          const token = json.choices?.[0]?.delta?.content
          if (token) { res.write(token); wroteAny = true }
        } catch { /* malformed line — skip */ }
      }
    }

    clearTimeout(timeoutId)
    if (!wroteAny) res.write('Sorry, I couldn\'t generate a response. Try rephrasing.')
    res.end()
  } catch (err) {
    clearTimeout(timeoutId)
    const isAbort = err?.name === 'AbortError' || /abort|timeout/i.test(String(err?.message ?? ''))
    if (!res.headersSent) {
      const status = isAbort ? 504 : 502
      res.status(status).json({ error: isAbort ? 'Follow-up timed out. Groq is slow right now — try again in a moment.' : 'AI service error' })
    } else {
      try { res.end() } catch { /* already closed */ }
    }
  }
}

// ── System prompts (distinct personas per call) ─────────────────────────────

const SYSTEM_ANALYSIS = 'You are a senior technical analyst writing a specialist\'s report. Return only valid JSON, no markdown fences, no extra text. Your job is INTERPRETATION, not decision-making. Each indicator field discusses ONLY that indicator in isolation, in 1-2 sentences. Then indicatorConfluence explicitly names where indicators agree and where they contradict. rangeContext and fundamentalContext situate the read in a wider frame. Do NOT emit a verdict, entry price, or stop loss — a separate strategist owns those. Cite specific numbers in every field. Total 150-250 words across all string fields.'

// ── Compare handler (cross-ticker commentary) ───────────────────────────────
// Feeds the CompareView. Takes 2-4 ticker snapshots and returns a short
// analyst comparison plus "leaders" chips (Momentum / Value / Quality).
// Kept minimal on purpose — the individual side panels already show the
// full stack; this pass is just the synthesis prose Phase 6 spec asks for
// ("NVDA has stronger momentum but AMD is cheaper on P/E").
async function handleCompare(req, res) {
  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service unavailable' })

  const tickers = Array.isArray(req.body?.tickers) ? req.body.tickers : []
  if (tickers.length < 2 || tickers.length > 4) {
    return res.status(400).json({ error: 'Provide 2–4 tickers to compare' })
  }
  for (const t of tickers) {
    if (!validateTicker(t.ticker)) return res.status(400).json({ error: `Invalid ticker: ${t.ticker}` })
  }

  // Compact one-line-per-ticker context. Deliberately terse — the model gets
  // fewer tokens to fixate on any single stat so the comparison stays
  // multi-dimensional.
  const lines = tickers.map(t => {
    const rsi   = t.rsi != null ? t.rsi.toFixed(1) : 'N/A'
    const macd  = t.macd?.bullish == null ? 'N/A' : (t.macd.bullish ? 'bullish' : 'bearish')
    const bb    = t.bb?.pct != null ? `${t.bb.pct}%` : 'N/A'
    const pe    = t.pe != null ? t.pe.toFixed(1) : 'N/A'
    const eps5  = t.epsGrowth5Y != null ? `${t.epsGrowth5Y.toFixed(1)}%` : 'N/A'
    const beta  = t.beta != null ? t.beta.toFixed(2) : 'N/A'
    const chg   = t.dp != null ? `${t.dp >= 0 ? '+' : ''}${t.dp.toFixed(2)}%` : 'N/A'
    const cap   = t.marketCap ? `$${(t.marketCap / 1000).toFixed(1)}B` : 'N/A'
    return `${t.ticker}: $${t.price?.toFixed(2) ?? '?'} today ${chg} · RSI ${rsi} · MACD ${macd} · BB ${bb} · P/E ${pe} · EPS 5Y ${eps5} · β ${beta} · cap ${cap} · verdict ${t.verdict ?? 'N/A'}`
  }).join('\n')

  const prompt = `You are comparing ${tickers.length} tickers head-to-head for a Kairo user.

${lines}

Return ONLY this JSON — no markdown fences, no extra keys:
{
  "commentary": "<2-3 sentences comparing these tickers. Cite specific numbers. Name winners and losers by ticker. Cover at least: price action, valuation, momentum. Example tone: 'NVDA has stronger momentum with RSI 68 vs AMD at 52, but AMD is cheaper on P/E (24 vs 42).'>",
  "leaders": {
    "momentum": "<ticker leading on RSI + MACD confluence>",
    "value":    "<ticker cheapest on P/E vs EPS growth>",
    "quality":  "<ticker with best risk-adjusted profile: lower beta, higher confidence verdict, moderate BB position>"
  }
}

Rules: cite specific ticker names + numbers. Never hedge. Never use "as an AI". If a metric is N/A for a ticker, skip that dimension rather than guess.`

  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort('analyze-compare:timeout'), 10000)

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model:       'openai/gpt-oss-120b',
        messages:    [
          { role: 'system', content: 'You are a senior analyst producing head-to-head comparisons. Return valid JSON only. Cite specific tickers and numbers. Every field must reference at least one ticker by name.' },
          { role: 'user',   content: prompt },
        ],
        temperature: 0.4,
      }),
      signal: abort.signal,
    })
    clearTimeout(timeoutId)
    if (!r.ok) return res.status(502).json({ error: `AI service error (${r.status})` })
    const json = await r.json()
    const raw  = json.choices?.[0]?.message?.content ?? ''
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return res.status(502).json({ error: 'Malformed AI response' })
    let parsed
    try { parsed = JSON.parse(raw.slice(start, end + 1)) }
    catch { return res.status(502).json({ error: 'Malformed AI response' }) }

    // Normalize leader tickers to uppercase; drop any that isn't in the
    // input set so the UI's chip logic never highlights a ghost.
    const validSet = new Set(tickers.map(t => t.ticker.toUpperCase()))
    const cleanLeader = v => {
      const u = String(v ?? '').toUpperCase().trim()
      return validSet.has(u) ? u : null
    }
    parsed.leaders = {
      momentum: cleanLeader(parsed.leaders?.momentum),
      value:    cleanLeader(parsed.leaders?.value),
      quality:  cleanLeader(parsed.leaders?.quality),
    }
    parsed.commentary = String(parsed.commentary ?? '').trim().slice(0, 500)

    res.json(parsed)
  } catch (err) {
    clearTimeout(timeoutId)
    const isAbort = err?.name === 'AbortError' || /abort|timeout/i.test(String(err?.message ?? ''))
    res.status(isAbort ? 504 : 502).json({ error: isAbort ? 'Compare request timed out' : 'AI service error' })
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── AUTH — server-authoritative. Every AI mode (verdict / analysis /
  //     followup / compare) requires a valid Supabase JWT. We never read a
  //     user id from the request body. Anonymous callers get 401 and NO Groq
  //     call is ever made. ─────────────────────────────────────────────────
  const admin = getSupabaseAdmin()
  const user  = await requireUser(req, res, admin)
  if (!user) return                    // requireUser already wrote 401/500

  // ── ENTITLEMENT — Free vs Pro decided from the DB, not the client. ───────
  const ent = await getEntitlement(user, admin)

  // ── REQUEST MODE ─────────────────────────────────────────────────────────
  const rawType = req.body?.type
  const mode =
    rawType === 'followup' ? 'followup' :
    rawType === 'compare'  ? 'compare'  :
    rawType === 'analysis' ? 'analysis' : 'verdict'

  // Followup + compare carry a different body shape and are handled by their
  // own functions. For free users they consume one verdict-quota unit BEFORE
  // any Groq call; Pro bypasses. This closes the bypass where a client could
  // hit Groq for free via the alternate modes.
  if (mode === 'followup' || mode === 'compare') {
    if (!ent.isPro) {
      const decision = await consumeAnalyzeQuota(admin, user.id, mode, null)
      if (!decision.allowed) return sendQuotaExceeded(res, decision)
    }
    return mode === 'followup' ? handleFollowup(req, res) : handleCompare(req, res)
  }

  // Groq key is only needed for the detailed-analysis (LLM) path now; the
  // verdict comes from the deterministic engine below.
  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY

  // Validate ticker
  const ticker = validateTicker(req.body?.ticker)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker' })

  // Require the essential fields
  const { quote, profile, metrics, indicators, recentCandles, noTechnicals } = req.body ?? {}
  if (!quote || typeof quote.c !== 'number') return res.status(400).json({ error: 'Invalid quote data' })
  if (!Array.isArray(recentCandles)) return res.status(400).json({ error: 'Invalid candle data' })
  if (recentCandles.length > 20) return res.status(400).json({ error: 'Too many candles' })

  // 'verdict' (default, also the signal-alert path) or 'analysis'.
  const type = mode

  // ── TRUST GUARD ────────────────────────────────────────────────────────────
  // A confident BUY/SELL/HOLD with entry + stop must NEVER be generated when we
  // have no real technical read to stand on. Runs BEFORE quota consumption so an
  // "unavailable" verdict never burns the user's 1/day allowance.
  if (type === 'verdict' && !hasCoreTechnicals(indicators, noTechnicals)) {
    return res.json({
      unavailable: true,
      reason: 'insufficient technical data',
      availableTechnicals: countTechnicals(indicators),
    })
  }

  // ── QUOTA — free tier only, Pro bypasses. Consumed AFTER validation + trust
  //     guard but BEFORE the Groq call, so a denied request never reaches the
  //     AI provider. Atomic in Postgres (see consume_analyze_quota). ─────────
  if (!ent.isPro) {
    const quota = await consumeAnalyzeQuota(admin, user.id, type, ticker)
    if (!quota.allowed) return sendQuotaExceeded(res, quota)
  }

  // ── UNIFIED DECISION ENGINE (verdict) ──────────────────────────────────────
  // The verdict is produced deterministically from combined evidence — no LLM
  // decides direction, so the output can never contradict itself. See
  // lib/decisionEngine.js. The detailed per-indicator ANALYSIS panel below is
  // still an LLM call (isolated interpretation, no verdict).
  if (type === 'verdict') {
    const decision = buildDecision({
      ticker,
      price:         quote.c,
      rsi:           indicators?.rsi ?? null,
      macd:          indicators?.macd ?? null,
      bb:            indicators?.bb ?? null,
      sma50:         req.body?.sma50 ?? null,
      sma200:        req.body?.sma200 ?? null,
      volume:        req.body?.volume ?? null,
      priceChange5d: quote?.priceChange5d ?? null,
      hi52:          metrics?.metric?.['52WeekHigh'] ?? null,
      lo52:          metrics?.metric?.['52WeekLow'] ?? null,
      support:       req.body?.sr?.support ?? [],
      resistance:    req.body?.sr?.resistance ?? [],
      noTechnicals,
    })
    if (decision.unavailable) return res.json(decision)
    // Keep verdict/riskLevel as the 3-state values existing consumers
    // (verdict_history, track-record, signal-alert, AIChat) expect, while
    // exposing the richer engine output alongside.
    const { legacyVerdict, legacyRisk, ...rest } = decision
    return res.json({
      ...rest,
      verdict:     legacyVerdict,    // BUY | HOLD | SELL  (compat)
      verdictCode: decision.verdict, // STRONG_BUY … STRONG_SELL
      riskLevel:   legacyRisk,       // LOW | MEDIUM | HIGH (compat)
    })
  }

  // ── DETAILED ANALYSIS (LLM, per-indicator evidence only — no verdict) ──────
  if (!apiKey) return res.status(500).json({ error: 'AI analysis service is unavailable' })

  const ctx = buildContext({ ticker, quote, profile, metrics, indicators, recentCandles, noTechnicals })
  const prompt        = buildAnalysisPrompt(ctx)
  const systemPrompt  = SYSTEM_ANALYSIS

  // AbortController gates the Groq fetch at 8 seconds so we return a clean
  // 504 with a useful body before Vercel's serverless function timeout (10s
  // on the Hobby plan) kills the whole function with a 502 crash.
  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort('analyze:timeout'), 8000)

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: prompt       },
        ],
      }),
      signal: abort.signal,
    })

    clearTimeout(timeoutId)

    if (!groqRes.ok) {
      return res.status(502).json({ error: `AI analysis upstream error (${groqRes.status})` })
    }

    const json = await groqRes.json()
    const raw  = json.choices?.[0]?.message?.content ?? ''

    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return res.status(502).json({ error: 'AI returned malformed response' })

    let parsed
    try {
      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch {
      return res.status(502).json({ error: 'AI returned malformed response' })
    }


    res.json(parsed)
  } catch (err) {
    clearTimeout(timeoutId)
    if (err?.name === 'AbortError' || /abort|timeout/i.test(String(err?.message ?? ''))) {
      return res.status(504).json({ error: 'Analysis request timed out. Groq is slow right now — try again in a moment.' })
    }
    return res.status(502).json({ error: 'AI analysis service error' })
  }
}

// Vercel function config — allow up to 25 seconds for the function as a
// whole. Our internal AbortController still cuts the Groq call at 8s and
// returns a 504; this just gives us breathing room for cold starts.
export const config = {
  maxDuration: 25,
}
