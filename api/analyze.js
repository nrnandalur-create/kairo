import { rateLimit } from '../lib/rateLimit.js'
import { validateTicker } from '../lib/validate.js'

function fmtCap(n) {
  if (!n) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
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

// ── VERDICT prompt (feeds the Recommendation panel) ─────────────────────────
// Optimised for a decisive, sub-60-word summary — doctor's-diagnosis tone.
// The model is explicitly told NOT to enumerate indicators — that's the
// detailed panel's job — and to name ONE decisive driver.
function buildVerdictPrompt(ctx) {
  const techNote = ctx.noTechnicals
    ? '\n\n⚠️ NO RELIABLE TECHNICAL DATA. Do NOT cite RSI, MACD, Bollinger Bands. Base your verdict on quote + fundamentals + 52-week range only. Cap confidence at 60.\n'
    : ''

  return `You are an equity strategist delivering a punchy verdict. Return ONLY a valid JSON object.${techNote}

TICKER: ${ctx.ticker}
COMPANY: ${ctx.companyName}
PRICE: $${ctx.quote.c} (${ctx.quote.dp > 0 ? '+' : ''}${Number(ctx.quote.dp).toFixed(2)}% today, 5d: ${ctx.priceChange5d}%)
RSI (14): ${ctx.rsiLine}
MACD: ${ctx.macdLine}
BB: ${ctx.bbLine}
52W: ${ctx.rangeCtx}

STYLE RULES — enforced strictly:
- summary MUST be UNDER 60 words total.
- Name ONE decisive driver (the single most important factor). Do not list two or three factors.
- Do NOT enumerate every indicator — leave that to the detailed analyst.
- Punchy, declarative sentences. No hedging language ("might", "could potentially"). State the call.
- entryReason and stopReason: ONE sentence each, ≤ 20 words, cite a specific price level.

Return ONLY this JSON with no markdown fences:
{
  "verdict": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 0-100 — never exactly 60>,
  "entryPrice": <number>,
  "stopLoss": <number>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "summary": "<UNDER 60 words. One decisive driver + verdict rationale. Punchy tone.>",
  "entryReason": "<ONE sentence. Why enter here specifically. Cite a level.>",
  "stopReason": "<ONE sentence. Why this stop protects the thesis. Cite a level.>"
}`
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

// ── Normalisation ───────────────────────────────────────────────────────────
function normaliseVerdict(analysis) {
  if (typeof analysis.verdict === 'string') {
    const v = analysis.verdict.toLowerCase()
    analysis.verdict =
      v === 'bullish' || v === 'buy'  ? 'BUY'  :
      v === 'bearish' || v === 'sell' ? 'SELL' :
      v === 'neutral' || v === 'hold' ? 'HOLD' :
      analysis.verdict.toUpperCase()
  }
  if (!['BUY', 'SELL', 'HOLD'].includes(analysis.verdict)) analysis.verdict = 'HOLD'

  if (typeof analysis.riskLevel === 'string') {
    const r = analysis.riskLevel.toLowerCase()
    analysis.riskLevel =
      r === 'low'    ? 'LOW'    :
      r === 'medium' ? 'MEDIUM' :
      r === 'high'   ? 'HIGH'   :
      analysis.riskLevel.toUpperCase()
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(analysis.riskLevel)) analysis.riskLevel = 'MEDIUM'

  return analysis
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
        model: 'llama-3.3-70b-versatile',
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
const SYSTEM_VERDICT = 'You are an equity strategist known for decisive, punchy calls. Return only valid JSON, no markdown fences, no extra text. Your job is a DIAGNOSIS: one sentence saying what to do, one sentence saying why. If RSI ≥ 65 lean SELL. If RSI ≤ 40 lean BUY. If MACD above signal lean BUY. If price at upper Bollinger Band lean SELL. Weight confidence by indicator confluence (70-90 when RSI, MACD, and BB agree). Never return exactly 60 for confidence. Never hedge. Never enumerate every indicator — the detailed analyst does that. Cite specific numbers in every field.'

const SYSTEM_ANALYSIS = 'You are a senior technical analyst writing a specialist\'s report. Return only valid JSON, no markdown fences, no extra text. Your job is INTERPRETATION, not decision-making. Each indicator field discusses ONLY that indicator in isolation, in 1-2 sentences. Then indicatorConfluence explicitly names where indicators agree and where they contradict. rangeContext and fundamentalContext situate the read in a wider frame. Do NOT emit a verdict, entry price, or stop loss — a separate strategist owns those. Cite specific numbers in every field. Total 150-250 words across all string fields.'

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Followup (streaming, AIChat) short-circuits everything below because
  // its body shape is completely different (question + history, no candles).
  if (req.body?.type === 'followup') return handleFollowup(req, res)

  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI analysis service is unavailable' })

  // Validate ticker
  const ticker = validateTicker(req.body?.ticker)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker' })

  // Require the essential fields
  const { quote, profile, metrics, indicators, recentCandles, noTechnicals } = req.body ?? {}
  if (!quote || typeof quote.c !== 'number') return res.status(400).json({ error: 'Invalid quote data' })
  if (!Array.isArray(recentCandles)) return res.status(400).json({ error: 'Invalid candle data' })
  if (recentCandles.length > 20) return res.status(400).json({ error: 'Too many candles' })

  // Two distinct call modes. Default to 'verdict' so the existing signal-alert
  // path (which just posts { ticker, quote, ... }) still returns the verdict
  // schema without a client change.
  const type = req.body?.type === 'analysis' ? 'analysis' : 'verdict'

  const ctx = buildContext({ ticker, quote, profile, metrics, indicators, recentCandles, noTechnicals })
  const prompt        = type === 'analysis' ? buildAnalysisPrompt(ctx) : buildVerdictPrompt(ctx)
  const systemPrompt  = type === 'analysis' ? SYSTEM_ANALYSIS         : SYSTEM_VERDICT

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
        model: 'llama-3.3-70b-versatile',
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

    // Only the verdict response has enum fields to normalise; analysis is
    // free-text throughout.
    if (type === 'verdict') parsed = normaliseVerdict(parsed)

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
