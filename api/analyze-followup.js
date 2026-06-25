import { rateLimit } from './_rateLimit.js'
import { validateTicker } from './_validate.js'

// Maximum question length — long enough for a real follow-up, short
// enough to bound prompt cost / abuse surface.
const MAX_QUESTION_LEN = 400
// Maximum prior-turn count we'll include in the prompt — keeps context
// reasonable and predictable.
const MAX_HISTORY      = 6

function buildPrompt({ ticker, context, history, question }) {
  // `context` is the original /api/analyze response — verdict + summary +
  // bull/bear cases — so the model has the same grounding as the
  // recommendation card.
  const ctxLines = context ? [
    `PRIOR ANALYSIS:`,
    `Verdict: ${context.verdict ?? 'N/A'}`,
    `Confidence: ${context.confidence ?? 'N/A'}/100`,
    `Risk: ${context.riskLevel ?? 'N/A'}`,
    `Summary: ${context.summary ?? 'N/A'}`,
    context.bullCase ? `Bull case: ${context.bullCase}` : null,
    context.bearCase ? `Bear case: ${context.bearCase}` : null,
    context.tradeIdea ? `Trade idea: ${context.tradeIdea}` : null,
  ].filter(Boolean).join('\n') : ''

  const histLines = (history ?? [])
    .slice(-MAX_HISTORY)
    .map(t => `${t.role === 'user' ? 'USER' : 'ANALYST'}: ${t.content}`)
    .join('\n')

  return [
    `You are continuing a conversation with a user about ${ticker}. Stay strictly focused on this ticker and the data already provided. Do not hallucinate prices, fundamentals, or news you don't have.`,
    ``,
    ctxLines,
    histLines ? `\nCONVERSATION SO FAR:\n${histLines}` : '',
    `\nUSER FOLLOW-UP: ${question}`,
    ``,
    `Answer in plain prose — 2–4 sentences, conversational but precise. Cite specific values from the prior analysis where relevant. If the user asks for a number you don't have, say so explicitly. End with NO disclaimers; the surrounding UI already handles that.`,
  ].filter(Boolean).join('\n')
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service unavailable' })

  const ticker = validateTicker(req.body?.ticker)
  if (!ticker) return res.status(400).json({ error: 'Invalid ticker' })

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : ''
  if (!question)                       return res.status(400).json({ error: 'Question required' })
  if (question.length > MAX_QUESTION_LEN) return res.status(400).json({ error: 'Question too long' })

  const history = Array.isArray(req.body?.history) ? req.body.history : []
  const context = req.body?.context ?? null

  const prompt = buildPrompt({ ticker, context, history, question })

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role:    'system',
            content: 'You are an institutional equity analyst answering follow-up questions about a single ticker. Be specific, cite numbers from the prior analysis when possible, never invent data, and keep responses to 2–4 sentences. No markdown fences, no headers, no bullet lists — flowing prose only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!groqRes.ok) return res.status(502).json({ error: 'AI service error' })

    const json   = await groqRes.json()
    const answer = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!answer) return res.status(502).json({ error: 'AI returned an empty answer' })

    res.json({ answer })
  } catch {
    res.status(502).json({ error: 'AI service error' })
  }
}
