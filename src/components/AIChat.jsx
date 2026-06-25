import { useState, useEffect, useRef } from 'react'
import { fetchAnalyzeFollowup } from '../services/analyzeFollowup'
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
  const [lastAt,  setLastAt]  = useState(null)
  const scrollRef = useRef(null)

  // Reload from localStorage when the ticker changes
  useEffect(() => {
    setHistory(loadHistory(ticker))
    setInput('')
  }, [ticker])

  // Auto-scroll to the latest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history, loading])

  if (!ticker) return null

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || loading) return
    if (q.length > MAX_QUESTION) {
      toast.error(`Question too long (max ${MAX_QUESTION} characters)`)
      return
    }

    const next = [...history, { role: 'user', content: q, ts: Date.now() }]
    setHistory(next)
    setInput('')
    setLoading(true)

    try {
      const { answer } = await fetchAnalyzeFollowup({
        ticker,
        context,
        history: next,
        question: q,
      })
      const withAnswer = [...next, { role: 'assistant', content: answer, ts: Date.now() }]
      setHistory(withAnswer)
      saveHistory(ticker, withAnswer)
      setLastAt(Date.now())
    } catch (err) {
      toast.error(err.message ?? 'AI follow-up failed')
      setHistory(history)   // roll back the optimistic user message
    } finally {
      setLoading(false)
    }
  }

  const clear = () => {
    setHistory([])
    saveHistory(ticker, [])
    toast.show('Chat history cleared')
  }

  return (
    <div className="w-full glass-card rounded-2xl p-5 sm:p-6 flex flex-col gap-4 animate-enter">
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
          {loading && <ThinkingBubble />}
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
          {loading && <ThinkingBubble />}
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
          className="flex-1 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-3 py-2 text-sm text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors disabled:opacity-50"
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
