import { rateLimit } from '../lib/rateLimit.js'
import { validateTicker } from '../lib/validate.js'

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

  // Stream needs more headroom than analyze.js — wait up to 12s for first
  // chunk so a slow Groq cold-start still streams a real answer. Beyond that
  // we abort and let the client surface "timed out".
  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort('analyze-followup:timeout'), 12000)

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        stream: true,
        messages: [
          {
            role:    'system',
            content: 'You are an institutional equity analyst answering follow-up questions about a single ticker. Be specific, cite numbers from the prior analysis when possible, never invent data, and keep responses to 2–4 sentences. No markdown fences, no headers, no bullet lists — flowing prose only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: abort.signal,
    })

    if (!groqRes.ok) {
      clearTimeout(timeoutId)
      return res.status(502).json({ error: `AI service error (${groqRes.status})` })
    }

    // Stream Groq's SSE response back to the client as plain UTF-8 chunks.
    // The client reads the response body progressively and renders tokens
    // as they arrive — no waiting for the full payload.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')   // disable nginx/proxy buffering

    const reader  = groqRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''
    let wroteAny  = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''   // keep last partial line for next read

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          res.end()
          return
        }
        try {
          const json  = JSON.parse(data)
          const token = json.choices?.[0]?.delta?.content
          if (token) {
            res.write(token)
            wroteAny = true
          }
        } catch { /* malformed line — skip */ }
      }
    }

    clearTimeout(timeoutId)
    if (!wroteAny) {
      res.write('Sorry, I couldn\'t generate a response. Try rephrasing.')
    }
    res.end()
  } catch (err) {
    clearTimeout(timeoutId)
    const isAbort = err?.name === 'AbortError' || /abort|timeout/i.test(String(err?.message ?? ''))
    // If we haven't started streaming yet, send a JSON error. Otherwise the
    // partial response is what the user will see — just end the stream.
    if (!res.headersSent) {
      const status = isAbort ? 504 : 502
      const msg = isAbort
        ? 'Follow-up timed out. Groq is slow right now — try again in a moment.'
        : 'AI service error'
      res.status(status).json({ error: msg })
    } else {
      try { res.end() } catch { /* already closed */ }
    }
  }
}

// Match analyze.js — give the function 25s of breathing room even though
// our internal AbortController caps the upstream call at 12s.
export const config = {
  maxDuration: 25,
}
