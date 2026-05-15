export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  console.log(`[analyze] ANTHROPIC_API_KEY=${apiKey ? `set (${apiKey.slice(0, 4)}…)` : 'MISSING'}`)
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set' })

  const { ticker, quote, profile, metrics, candles } = req.body
  if (!ticker || !quote) return res.status(400).json({ error: 'Missing ticker or quote in request body' })

  const recentCandles = (candles ?? []).slice(-10)
  const priceChange5d = candles?.length >= 5
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

  try {
    console.log(`[analyze] calling Claude for ${ticker}…`)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error(`[analyze] Anthropic HTTP ${response.status}: ${errBody.slice(0, 200)}`)
      return res.status(500).json({ error: `Anthropic API error ${response.status}: ${errBody.slice(0, 120)}` })
    }

    const data = await response.json()
    const raw = data.content?.[0]?.text ?? ''
    console.log(`[analyze] Claude raw response (first 300 chars): ${raw.slice(0, 300)}`)

    // Strip accidental markdown fences
    const text = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()

    let analysis
    try {
      analysis = JSON.parse(text)
    } catch (parseErr) {
      console.error(`[analyze] JSON parse failed: ${parseErr.message}`)
      console.error(`[analyze] raw text was: ${text.slice(0, 500)}`)
      return res.status(500).json({ error: `Claude returned invalid JSON: ${parseErr.message}` })
    }

    // Normalise fields that might come back with wrong casing or types
    if (typeof analysis.recommendation === 'string') {
      analysis.recommendation = analysis.recommendation.toUpperCase()
    }
    if (!['BUY', 'SELL', 'HOLD'].includes(analysis.recommendation)) {
      analysis.recommendation = 'HOLD'
    }
    if (!['bullish', 'bearish', 'neutral'].includes(analysis.verdict)) {
      analysis.verdict = 'neutral'
    }

    console.log(`[analyze] success: verdict=${analysis.verdict} rec=${analysis.recommendation} score=${analysis.score}`)
    res.json(analysis)
  } catch (err) {
    console.error(`[analyze] error: ${err.message}`)
    res.status(500).json({ error: `Analysis error: ${err.message}` })
  }
}
