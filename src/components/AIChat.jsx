import { useState, useEffect, useRef } from 'react'
import { fetchAnalyzeFollowupStream } from '../services/analyzeFollowup'
import { toast } from '../utils/toast'
import DataTimestamp from './DataTimestamp'
import InfoTooltip from './InfoTooltip'

// Per-ticker chat history is persisted under this prefix.
const STORAGE_PREFIX = 'kairo_chat_'
const MAX_HISTORY    = 20         // keep recent turns; drop older
const MAX_QUESTION   = 400

function loadHistory(ticker) {
  if (!ticker) return []
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + ticker)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveHistory(ticker, history) {
  if (!ticker) return
  try { localStorage.setItem(STORAGE_PREFIX + ticker, JSON.stringify(history.slice(-MAX_HISTORY))) }
  catch { /* quota */ }
}

const SUGGESTIONS = [
  'Why this verdict?',
  'What would change your mind?',
  'How does it compare to its peers?',
  'What are the catalysts to watch?',
]

function Bubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed ${
          isUser
            ? 'bg-[#22B585]/12 border border-[#22B585]/25 text-[var(--c-text)] rounded-br-md'
            : 'bg-[var(--c-input-bg)] border border-[var(--c-input-border)] text-[var(--c-text)]/90 rounded-bl-md'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-2xl rounded-bl-md px-3.5 py-2.5 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#22B585]/60 animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-[#22B585]/60 animate-pulse" style={{ animationDelay: '120ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-[#22B585]/60 animate-pulse" style={{ animationDelay: '240ms' }} />
      </div>
    </div>
  )
}

export default function AIChat({ ticker, context }) {
  const [history, setHistory] = useState(() => loadHistory(ticker))
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)   // true once first token arrives
  const [lastAt,  setLastAt]  = useState(null)
  const scrollRef = useRef(null)
  const abortRef  = useRef(null)

  // Reload from localStorage when the ticker changes — also abort any
  // in-flight stream from the previous ticker.
  useEffect(() => {
    abortRef.current?.abort()
    setHistory(loadHistory(ticker))
    setInput('')
  }, [ticker])

  // Auto-scroll to the latest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, loading, streaming])

  if (!ticker) return null

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || loading) return
    if (q.length > MAX_QUESTION) {
      toast.error(`Question too long (max ${MAX_QUESTION} characters)`)
      return
    }

    const withUser = [...history, { role: 'user', content: q, ts: Date.now() }]
    // Optimistic: render the user's question + an empty assistant slot
    // that we fill in as tokens stream back.
    setHistory([...withUser, { role: 'assistant', content: '', ts: Date.now() }])
    setInput('')
    setLoading(true)
    setStreaming(false)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let full = ''
      let started = false
      await fetchAnalyzeFollowupStream({
        ticker,
        context,
        history: withUser,
        question: q,
        signal: controller.signal,
        onChunk: (chunk) => {
          if (!started) { setStreaming(true); started = true }
          full += chunk
          // Replace the placeholder assistant message's content with the
          // running accumulation.
          setHistory((h) => {
            const next = h.slice()
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: full }
            }
            return next
          })
        },
      })

      const finalHistory = [...withUser, { role: 'assistant', content: full || '…', ts: Date.now() }]
      setHistory(finalHistory)
      saveHistory(ticker, finalHistory)
      setLastAt(Date.now())
    } catch (err) {
      // Don't toast or roll back on a user-initiated abort (e.g. switched ticker).
      if (err.name !== 'AbortError') {
        toast.error(err.message ?? 'AI follow-up failed')
        setHistory(history)
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      setStreaming(false)
    }
  }

  const clear = () => {
    setHistory([])
    saveHistory(ticker, [])
    toast.show('Chat history cleared')
  }

  const retry = () => {
    if (loading) return
    // Find the most recent user message; its content is what we'll re-ask.
    let lastUserIdx = -1
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx < 0) return
    const lastUser = history[lastUserIdx]
    // Roll the history back to just before that user turn — send() will
    // append it again and stream a fresh assistant reply in place.
    setHistory(history.slice(0, lastUserIdx))
    // Defer to next tick so setHistory commits before send reads history.
    queueMicrotask(() => send(lastUser.content))
  }

  const lastIsAssistant = history.length > 0 && history[history.length - 1].role === 'assistant'

  return (
    <div className="w-full glass-card rounded-xl p-4 sm:p-5 flex flex-col gap-4 animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em] inline-flex items-center">
          Ask the analyst
          <InfoTooltip>
            Conversational follow-ups on {ticker}. Grounded in the prior AI Recommendation context; the model is told not to invent prices or fundamentals it doesn&apos;t have.
          </InfoTooltip>
        </span>
        {history.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--c-text-faint)] hover:text-[#ef5454] transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* History */}
      {history.length > 0 ? (
        <div
          ref={scrollRef}
          className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1"
        >
          {history.map((m, i) => <Bubble key={i} {...m} />)}
          {loading && !streaming && <ThinkingBubble />}
          {lastIsAssistant && !loading && (
            <button
              type="button"
              onClick={retry}
              title="Regenerate the last response"
              aria-label="Regenerate last response"
              className="self-start inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--c-text-faint)] hover:text-[#22B585] transition-colors cursor-pointer mt-0.5"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6a4 4 0 016.83-2.83L10 4M10 1.5V4H7.5M10 6a4 4 0 01-6.83 2.83L2 8M2 10.5V8h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Retry
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--c-text-muted)] leading-relaxed">
            Ask anything about {ticker}&apos;s analysis. Suggestions:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                disabled={loading}
                className="px-2.5 py-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-input-bg)] text-[11.5px] text-[var(--c-text-muted)] hover:border-[#22B585]/40 hover:text-[#22B585] cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          {loading && !streaming && <ThinkingBubble />}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          placeholder={loading ? 'Thinking…' : `Ask about ${ticker}…`}
          maxLength={MAX_QUESTION}
          disabled={loading}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="send"
          inputMode="text"
          className="flex-1 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-3 py-2 text-base sm:text-sm text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="bg-[#22B585] hover:bg-[#2BC093] active:scale-[0.96] disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2 rounded-lg transition-all duration-150 cursor-pointer"
        >
          Send
        </button>
      </div>

      {/* Footer — freshness of the last answer */}
      {lastAt && (
        <div className="flex items-center justify-end pt-2 -mb-1 border-t border-[var(--c-border)]/60">
          <DataTimestamp asOf={lastAt} source="Groq" />
        </div>
      )}
    </div>
  )
}
