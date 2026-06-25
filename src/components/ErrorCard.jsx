// Reusable error card. Use when an API fetch or computation fails.
//
//   <ErrorCard message="Couldn't reach Finnhub" onRetry={refetch} />
//
// Bear-color left border so it reads as an error without being alarmist.
export default function ErrorCard({ message, onRetry, dense = false }) {
  return (
    <div className={`w-full glass-card border-l-2 border-l-[#e24b4a]/70 rounded-2xl flex items-start gap-4 ${
      dense ? 'px-4 py-3' : 'px-5 py-4'
    } animate-enter`}>
      <span className="shrink-0 w-7 h-7 rounded-full bg-[#e24b4a]/10 border border-[#e24b4a]/25 text-[#e24b4a] flex items-center justify-center text-xs font-bold">
        !
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#e24b4a]">Something went wrong</p>
        <p className="text-xs text-[var(--c-text)]/80 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--c-text-faint)] hover:text-[#1D9E75] border border-[var(--c-border)] hover:border-[#1D9E75]/40 rounded-md px-2.5 py-1 cursor-pointer transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  )
}
