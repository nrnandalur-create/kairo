import { calcBBPosition } from '../utils/indicators'

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

  const bb = calcBBPosition(candles)
  let bbContext = 'Insufficient data for Bollinger Bands.'
  if (bb) {
    const zone = bb.pct >= 80
      ? `near the UPPER band (${bb.pct.toFixed(0)}%) — overbought warning, price is stretched and may be due for a pullback`
      : bb.pct <= 20
      ? `near the LOWER band (${bb.pct.toFixed(0)}%) — potential bounce zone, price may be oversold and ready to recover`
      : `near the MIDDLE band (${bb.pct.toFixed(0)}%) — neutral, no extreme signal from the bands`
    bbContext = `Price is ${zone}. Lower band: $${bb.lower}, upper band: $${bb.upper}.`
  }

  return `You are a sharp, confident financial analyst who explains things in plain English that a complete beginner can understand. Analyze the stock data below and return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.

TICKER: ${ticker}
COMPANY: ${profile?.name ?? ticker}
INDUSTRY: ${profile?.finnhubIndustry ?? 'Unknown'}

PRICE DATA:
- Current price: $${quote.c}
- Change today: ${quote.d > 0 ? '+' : ''}${quote.d?.toFixed(2)} (${quote.dp?.toFixed(2)}%)
- 5-day change: ${priceChange5d}%
- High today: $${quote.h} | Low today: $${quote.l}
- Previous close: $${quote.pc}

FUNDAMENTALS:
- Market cap: ${fmtCap(profile?.marketCapitalization)}
- P/E (TTM): ${metrics?.metric?.peBasicExclExtraTTM?.toFixed(1) ?? 'N/A'}
- EPS growth (5Y): ${metrics?.metric?.epsGrowth5Y?.toFixed(1) ?? 'N/A'}%
- Beta: ${metrics?.metric?.beta?.toFixed(2) ?? 'N/A'}
- 52W High: $${metrics?.metric?.['52WeekHigh']?.toFixed(2) ?? 'N/A'} | 52W Low: $${metrics?.metric?.['52WeekLow']?.toFixed(2) ?? 'N/A'}

BOLLINGER BANDS (20-period, 2σ):
${bbContext}

LAST 10 DAILY CANDLES (oldest → newest):
${recentCandles.map(c =>
  `  ${new Date(c.time * 1000).toISOString().slice(0, 10)}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${(c.volume / 1e6).toFixed(1)}M`
).join('\n')}

Return ONLY this JSON structure with no markdown fences:
{
  "verdict": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 0-100>,
  "entryPrice": <number — logical entry price based on current price action>,
  "stopLoss": <number — key level where the trade thesis is invalidated>,
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "summary": "<2-3 sentences in plain English a beginner can understand — cover what the price is doing, whether momentum looks strong or weak, and the overall vibe of this stock right now>",
  "bullCase": "<1-2 sentences — the strongest reason to be optimistic about this stock>",
  "bearCase": "<1-2 sentences — the most important risk or red flag to watch>",
  "bollingerExplanation": "<plain English explanation of where the price sits relative to the Bollinger Bands and what that means for the trade — upper band means overbought warning, lower band means potential bounce zone, middle means neutral>",
  "candlePatternMeaning": "<name the most notable candle pattern visible in the last 10 days and explain in 1-2 sentences what it means for the trade decision>",
  "tradeIdea": "<one specific, actionable sentence — what a trader should watch for or do right now, with a specific price level>"
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
          content: 'You are a financial analyst AI. Return only valid JSON, no markdown fences, no extra text.',
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

  // Normalise fields
  if (typeof analysis.verdict === 'string') {
    analysis.verdict = analysis.verdict.toUpperCase()
  }
  if (!['BUY', 'SELL', 'HOLD'].includes(analysis.verdict)) {
    analysis.verdict = 'HOLD'
  }
  if (typeof analysis.riskLevel === 'string') {
    analysis.riskLevel = analysis.riskLevel.toUpperCase()
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(analysis.riskLevel)) {
    analysis.riskLevel = 'MEDIUM'
  }

  return analysis
}
