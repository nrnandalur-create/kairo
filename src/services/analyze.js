import { calcBBPosition } from '../utils/indicators'

function buildPrompt({ ticker, quote, profile, metrics, candles }) {
  const recentCandles = (candles ?? []).slice(-10)
  const priceChange5d = candles?.length >= 5
    ? (((candles.at(-1).close - candles.at(-5).close) / candles.at(-5).close) * 100).toFixed(2)
    : 'N/A'

  // Bollinger Band position for plain-English context in the prompt
  const bb = calcBBPosition(candles)
  let bbContext = 'Insufficient data for Bollinger Bands.'
  if (bb) {
    const zone = bb.pct >= 80 ? 'near the UPPER band (overbought warning — price may be stretched and due for a pullback)'
                : bb.pct <= 20 ? 'near the LOWER band (potential bounce zone — price may be oversold and due for a recovery)'
                : 'near the MIDDLE band (neutral territory — no strong band signal)'
    bbContext = `Price is at ${bb.pct}% within the Bollinger Bands (0% = lower band $${bb.lower}, 100% = upper band $${bb.upper}). Currently ${zone}. In simple terms for a beginner: ${
      bb.pct >= 80 ? 'the stock has moved up quickly and may be running out of steam — caution is warranted.'
    : bb.pct <= 20 ? 'the stock has dropped a lot and may be ready to bounce — but confirm with other signals before buying.'
    : 'the stock is in a normal price range relative to recent history — no extreme signal from bands alone.'
    } Consider whether this BB position confirms or contradicts the overall recommendation.`
  }

  return `You are a quantitative financial analyst. Analyze the following real-time stock data and return a JSON object only — no markdown, no extra text.

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

BOLLINGER BANDS (20-period, 2σ):
${bbContext}

LAST 10 DAILY CANDLES (oldest → newest):
${recentCandles.map(c =>
  `  Date ${new Date(c.time * 1000).toISOString().slice(0, 10)}: O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${(c.volume / 1e6).toFixed(1)}M`
).join('\n')}

Return exactly this JSON structure with no markdown fences:
{
  "verdict": "bullish" | "bearish" | "neutral",
  "score": <number 1-10, where 10 = strongest buy>,
  "summary": "<3-4 sentence plain-English analysis of price action, momentum, fundamentals, and what the Bollinger Band position means for this stock right now>",
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
      model: 'llama3-8b-8192',
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
  console.log('[analyze] Groq raw response (first 300 chars):', raw.slice(0, 300))

  // Strip accidental markdown fences
  const text = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
  const analysis = JSON.parse(text)

  // Normalise fields
  if (typeof analysis.recommendation === 'string') {
    analysis.recommendation = analysis.recommendation.toUpperCase()
  }
  if (!['BUY', 'SELL', 'HOLD'].includes(analysis.recommendation)) {
    analysis.recommendation = 'HOLD'
  }
  if (!['bullish', 'bearish', 'neutral'].includes(analysis.verdict)) {
    analysis.verdict = 'neutral'
  }

  return analysis
}
