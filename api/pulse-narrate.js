import { rateLimit } from './_rateLimit.js'

// Generates a one-line AI narrative for The Pulse based on the current
// watchlist movers + macro context. Cheap — single Groq call, no streaming.

const MAX_TICKERS = 12

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service unavailable' })

  const quotes = Array.isArray(req.body?.quotes) ? req.body.quotes.slice(0, MAX_TICKERS) : []
  const macros = Array.isArray(req.body?.macros) ? req.body.macros.slice(0, 5) : []
  if (!quotes.length) return res.status(400).json({ error: 'No quotes provided' })

  const wlCtx = quotes
    .filter(q => q.changePct != null)
    .map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`)
    .join(', ')
  const mkCtx = macros
    .filter(q => q.changePct != null)
    .map(q => `${q.symbol} ${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%`)
    .join(', ')

  const prompt = `Watchlist live: ${wlCtx}
Market: ${mkCtx}

Write ONE crisp sentence narrating what's happening across this user's watchlist right now relative to the broader market. Cite the biggest mover by name. No "as an AI". No hedging. Under 25 words.`

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model:    'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
      }),
    })
    if (!r.ok) return res.status(502).json({ error: 'AI service error' })
    const json = await r.json()
    const narration = json.choices?.[0]?.message?.content?.trim()
    res.json({ narration: narration ?? '' })
  } catch {
    res.status(502).json({ error: 'AI service error' })
  }
}
