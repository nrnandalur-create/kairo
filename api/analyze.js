import { rateLimit } from './_rateLimit.js'
import { validateTicker } from './_validate.js'

function fmtCap(n) {
  if (!n) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

function buildPrompt({ ticker, quote, profile, metrics, indicators, recentCandles, noTechnicals }) {
  const { bb, rsi, macd } = indicators ?? {}

  // When real candles aren't available we strip everything indicator-derived
  // and tell the model NOT to fabricate technical readings. The verdict still
  // ships, just on quote + fundamentals, with appropriately lower confidence.
  const techNote = noTechnicals
    ? '\n\n⚠️ NO RELIABLE TECHNICAL DATA AVAILABLE for this ticker right now. Do NOT cite RSI, MACD, Bollinger Bands, or candle patterns. Base your verdict only on quote + fundamentals + 52-week range. Cap confidence at 60. State in the summary that technicals are unavailable.\n'
    : ''

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

  const priceChange5d = quote.priceChange5d ?? 'N/A'

  const candleRows = (recentCandles ?? []).map(c =>
    `  ${new Date(c.time * 1000).toISOString().slice(0, 10)}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${(c.volume / 1e6).toFixed(1)}M`
  ).join('\n')

  return `You are an institutional equity analyst. Analyze the data below with precision and return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.${techNote}

TICKER: ${ticker}
COMPANY: ${profile?.name ?? ticker}
INDUSTRY: ${profile?.finnhubIndustry ?? 'Unknown'}

PRICE DATA:
- Current price: $${quote.c}
- Change today: ${quote.d > 0 ? '+' : ''}${Number(quote.d).toFixed(2)} (${Number(quote.dp).toFixed(2)}%)
- 5-day change: ${priceChange5d}%
- High today: $${quote.h} | Low today: $${quote.l}
- Previous close: $${quote.pc}

TECHNICAL INDICATORS:
- RSI (14): ${rsiLine}
- MACD (12/26/9): ${macdLine}
- Bollinger Bands (20, 2σ): ${bbLine}
- 52-week range: ${rangeCtx}

FUNDAMENTALS:
- Market cap: ${fmtCap(profile?.marketCapitalization)}
- P/E (TTM): ${metrics?.metric?.peBasicExclExtraTTM?.toFixed(1) ?? 'N/A'}
- EPS growth (5Y): ${metrics?.metric?.epsGrowth5Y?.toFixed(1) ?? 'N/A'}%
- Beta: ${metrics?.metric?.beta?.toFixed(2) ?? 'N/A'}

LAST 10 DAILY CANDLES (oldest → newest):
${candleRows}

Return ONLY this JSON structure with no markdown fences:
{
  "verdict": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 0-100 — weight by indicator confluence; never default to 60>,
  "entryPrice": <number>,
  "stopLoss": <number>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "summary": "<2-3 sentences citing specific values: RSI level, MACD direction, BB position>",
  "bullCase": "<1-2 sentences grounded in specific indicator readings>",
  "bearCase": "<1-2 sentences identifying specific technical or fundamental risk>",
  "bollingerExplanation": "<1-2 sentences on BB position using exact band values>",
  "candlePatternMeaning": "<identify the most significant candle formation in the last 10 sessions>",
  "tradeIdea": "<one sentence with a specific entry condition, target price, and stop level>"
}`
}

function normalise(analysis) {
  if (typeof analysis.verdict === 'string') {
    const v = analysis.verdict.toLowerCase()
    analysis.verdict =
      v === 'bullish' || v === 'buy'    ? 'BUY'  :
      v === 'bearish' || v === 'sell'   ? 'SELL' :
      v === 'neutral' || v === 'hold'   ? 'HOLD' :
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

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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

  const prompt = buildPrompt({ ticker, quote, profile, metrics, indicators, recentCandles, noTechnicals })

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
          {
            role: 'system',
            content: 'You are an institutional equity analyst. Return only valid JSON, no markdown fences, no extra text. Deliver a decisive, quantitatively grounded verdict. Do NOT default to HOLD unless indicators are genuinely conflicted. If RSI is above 65 lean SELL. If RSI is below 40 lean BUY. If MACD is above signal lean BUY. If price is at the upper Bollinger Band lean SELL. Weight confidence by indicator confluence — agreement across RSI, MACD, and BB warrants 70-90. Never return exactly 60 for confidence. All text fields must cite specific numbers.',
          },
          { role: 'user', content: prompt },
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

    let analysis
    try {
      analysis = JSON.parse(raw.slice(start, end + 1))
    } catch {
      return res.status(502).json({ error: 'AI returned malformed response' })
    }

    res.json(normalise(analysis))
  } catch (err) {
    clearTimeout(timeoutId)
    // The client knows how to read these specific error strings (the new
    // <Unavailable> component picks copy based on /timeout/i and /candle/i
    // regexes) — keep them stable.
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
