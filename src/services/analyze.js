import { calcBBPosition, calcRSI, calcMACD } from '../utils/indicators'

function fmtCap(n) {
  if (!n) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

function buildPrompt({ ticker, quote, profile, metrics, candles }) {
  const recentCandles = (candles ?? []).slice(-10)
  const priceChange5d = candles?.length >= 5
    ? (((candles.at(-1).close - candles.at(-5).close) / candles.at(-5).close) * 100).toFixed(2)
    : 'N/A'

  const bb   = calcBBPosition(candles)
  const rsi  = calcRSI(candles)
  const macd = calcMACD(candles)

  const bbZone = bb
    ? bb.pct >= 80 ? `UPPER band (${bb.pct}%) — overbought warning`
    : bb.pct <= 20 ? `LOWER band (${bb.pct}%) — oversold, potential bounce`
    : `MIDDLE band (${bb.pct}%) — neutral`
    : 'N/A'
  const bbLine = bb ? `Lower $${bb.lower} | Upper $${bb.upper} | Price at ${bbZone}` : 'Insufficient data'

  const rsiLine = rsi != null
    ? `${rsi} — ${rsi >= 70 ? 'overbought (bearish signal)' : rsi <= 30 ? 'oversold (bullish signal)' : 'neutral range'}`
    : 'N/A'

  const macdLine = macd
    ? `MACD ${macd.value} / Signal ${macd.signal} — ${macd.bullish ? 'MACD above signal (bullish momentum)' : 'MACD below signal (bearish momentum)'}`
    : 'N/A'

  const hi52 = metrics?.metric?.['52WeekHigh']
  const lo52 = metrics?.metric?.['52WeekLow']
  const pctFrom52H = hi52 ? (((quote.c - hi52) / hi52) * 100).toFixed(1) : null
  const pctFrom52L = lo52 ? (((quote.c - lo52) / lo52) * 100).toFixed(1) : null
  const rangeCtx = hi52 && lo52
    ? `$${lo52.toFixed(2)} – $${hi52.toFixed(2)} (price is ${pctFrom52H}% from 52W high, +${pctFrom52L}% from 52W low)`
    : 'N/A'

  return `You are an institutional equity analyst. Analyze the data below with precision and return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.

TICKER: ${ticker}
COMPANY: ${profile?.name ?? ticker}
INDUSTRY: ${profile?.finnhubIndustry ?? 'Unknown'}

PRICE DATA:
- Current price: $${quote.c}
- Change today: ${quote.d > 0 ? '+' : ''}${quote.d?.toFixed(2)} (${quote.dp?.toFixed(2)}%)
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
${recentCandles.map(c =>
  `  ${new Date(c.time * 1000).toISOString().slice(0, 10)}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${(c.volume / 1e6).toFixed(1)}M`
).join('\n')}

Return ONLY this JSON structure with no markdown fences:
{
  "verdict": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 0-100 — weight by indicator confluence; never default to 60>,
  "entryPrice": <number — technically justified entry relative to current price and structure>,
  "stopLoss": <number — level that structurally invalidates the thesis>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "summary": "<2-3 sentences citing specific values: RSI level, MACD cross direction, BB position, and price action context. No generic statements.>",
  "bullCase": "<1-2 sentences grounded in specific indicator readings or price structure — cite the actual RSI, MACD, or BB values that support the long thesis>",
  "bearCase": "<1-2 sentences identifying the specific technical or fundamental risk — cite the metric or level that threatens the trade>",
  "bollingerExplanation": "<1-2 sentences on BB position using exact band values and the % rank — state the directional implication clearly>",
  "candlePatternMeaning": "<identify the most significant candle formation in the last 10 sessions by name, state its signal direction, and its implication for near-term price action>",
  "tradeIdea": "<one sentence with a specific entry condition, target price level, and stop level>"
}`
}

export async function fetchAnalysis({ ticker, quote, profile, metrics, candles }) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  if (!apiKey) throw new Error('VITE_GROQ_API_KEY is not set')

  const prompt = buildPrompt({ ticker, quote, profile, metrics, candles })

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are an institutional equity analyst. Return only valid JSON, no markdown fences, no extra text. Deliver a decisive, quantitatively grounded verdict. Do NOT default to HOLD unless indicators are genuinely conflicted. If RSI is above 65 lean SELL. If RSI is below 40 lean BUY. If MACD is above signal lean BUY. If price is at the upper Bollinger Band lean SELL. Weight confidence by indicator confluence — agreement across RSI, MACD, and BB warrants 70-90. Never return exactly 60 for confidence. All text fields must cite specific numbers, not generic observations.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Groq API error ${response.status}: ${errBody.slice(0, 120)}`)
  }

  const json = await response.json()
  const raw = json.choices[0].message.content
  console.log('[analyze] Groq raw response:', raw)

  // Extract JSON robustly — find the outermost { } regardless of markdown wrapping
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`Groq response contains no JSON object: ${raw.slice(0, 200)}`)
  const text = raw.slice(start, end + 1)

  let analysis
  try {
    analysis = JSON.parse(text)
  } catch (e) {
    throw new Error(`Failed to parse Groq JSON: ${e.message} — raw: ${text.slice(0, 200)}`)
  }

  console.log('[analyze] parsed analysis:', analysis)

  // Normalise verdict — map old-style bullish/bearish/neutral in case model ignores the schema
  if (typeof analysis.verdict === 'string') {
    const v = analysis.verdict.toLowerCase()
    if (v === 'bullish' || v === 'buy')  analysis.verdict = 'BUY'
    else if (v === 'bearish' || v === 'sell') analysis.verdict = 'SELL'
    else if (v === 'neutral' || v === 'hold') analysis.verdict = 'HOLD'
    else analysis.verdict = analysis.verdict.toUpperCase()
  }
  if (!['BUY', 'SELL', 'HOLD'].includes(analysis.verdict)) {
    analysis.verdict = 'HOLD'
  }

  if (typeof analysis.riskLevel === 'string') {
    const r = analysis.riskLevel.toLowerCase()
    if (r === 'low')    analysis.riskLevel = 'LOW'
    else if (r === 'medium') analysis.riskLevel = 'MEDIUM'
    else if (r === 'high')   analysis.riskLevel = 'HIGH'
    else analysis.riskLevel = analysis.riskLevel.toUpperCase()
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(analysis.riskLevel)) {
    analysis.riskLevel = 'MEDIUM'
  }

  return analysis
}
