// Follow-up Q&A on a previously-analyzed ticker. Streams the model's
// response token-by-token so the UI can render as words arrive.
//
//   await fetchAnalyzeFollowupStream({
//     ticker, context, history, question,
//     onChunk: (text) => …,   // called for each token batch
//     signal,                 // optional AbortSignal for cancel
//   })
//
// Resolves to the full assembled answer (also passed back) when the stream
// completes. Throws on transport / server errors.
export async function fetchAnalyzeFollowupStream({ ticker, context, history, question, onChunk, signal }) {
  // Consolidated into /api/analyze under Vercel's Hobby 12-function cap.
  // The `type: 'followup'` flag switches the handler into streaming mode.
  const res = await fetch('/api/analyze', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type: 'followup', ticker, context, history, question }),
    signal,
  })

  // Non-streaming JSON error (4xx / 5xx before any tokens were written).
  if (!res.ok) {
    let message = `Follow-up failed (${res.status})`
    try {
      const json = await res.json()
      if (json?.error) message = json.error
    } catch { /* not JSON */ }
    throw new Error(message)
  }

  if (!res.body) {
    // Older browsers / non-streaming fallback — treat the whole body as one chunk.
    const text = await res.text()
    onChunk?.(text)
    return text
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let answer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    if (chunk) {
      answer += chunk
      onChunk?.(chunk)
    }
  }

  return answer
}
