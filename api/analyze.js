import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { ticker, quote, profile, metrics, candles } = req.body

  const recentCandles = candles.slice(-10)
  const priceChange5d = candles.length >= 5
    ? (((candles.at(-1).close - candles.at(-5).close) / candles.at(-5).close) * 100).toFixed(2)
    : 'N/A'

  const prompt = `You are a quantitative financial analyst. Analyze the following real-time stock data and return a JSON object only — no markdown, no extra text.

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
- Market cap: $${profile?.marketCapitalization ? (profile.marketCapitalization / 1000).toFixed(1) + 'B' : 'N/A'}
- P/E (TTM): ${metrics?.metric?.peBasicExclExtraTTM?.toFixed(1) ?? 'N/A'}
- EPS growth (5Y): ${metrics?.metric?.epsGrowth5Y?.toFixed(1) ?? 'N/A'}%
- Beta: ${metrics?.metric?.beta?.toFixed(2) ?? 'N/A'}
- 52W High: $${metrics?.metric?.['52WeekHigh']?.toFixed(2) ?? 'N/A'} | 52W Low: $${metrics?.metric?.['52WeekLow']?.toFixed(2) ?? 'N/A'}

LAST 10 DAILY CANDLES (oldest → newest):
${recentCandles.map(c =>
  `  Date ${new Date(c.time * 1000).toISOString().slice(0, 10)}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${(c.volume / 1e6).toFixed(1)}M`
).join('\n')}

Return exactly this JSON structure with no markdown fences:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "score": <number 1-10, where 10 = strongest buy>,
  "summary": "<3-4 sentence plain-English analysis of price action, momentum, and fundamentals>",
  "bullCase": "<1-2 sentences on the strongest bull argument>",
  "bearCase": "<1-2 sentences on the strongest bear risk>",
  "tradeIdea": "<one specific, actionable idea — entry trigger, target, and stop context>",
  "patterns": [
    {
      "name": "<pattern name, e.g. Bullish Engulfing, Doji, Hammer, Shooting Star, Morning Star>",
      "signal": "bullish" | "bearish" | "neutral",
      "explanation": "<1-2 sentences: what this pattern means in the context of this stock's recent price action>",
      "traderAction": "<1 sentence: what traders typically do when they spot this pattern>",
      "timeframe": "<e.g. Daily · Last 2 candles>",
      "reliability": "<percentage string e.g. '63%' — typical win rate for this pattern>"
    }
  ],
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence": <integer 0-100>,
  "reasons": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "riskLevel": "Low" | "Medium" | "High",
  "entryPrice": <number — suggested entry price near current price>,
  "stopLoss": <number — suggested stop loss price>
}`

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: 'You are a financial analyst AI. Return only valid JSON, no markdown fences, no extra text.',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const analysis = JSON.parse(text)
  res.json(analysis)
}
