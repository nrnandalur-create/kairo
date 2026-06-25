// Follow-up Q&A on a previously-analyzed ticker.
//   ticker:   e.g. 'AAPL'
//   context:  the prior /api/analyze response (verdict, summary, etc.)
//   history:  [{ role: 'user'|'assistant', content: string }]  — prior turns
//   question: free-form user question
export async function fetchAnalyzeFollowup({ ticker, context, history, question }) {
  const res = await fetch('/api/analyze-followup', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ticker, context, history, question }),
  })

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}))
    throw new Error(error ?? `Follow-up failed (${res.status})`)
  }
  return res.json()  // { answer }
}
