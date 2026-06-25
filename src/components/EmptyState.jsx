// Reusable empty-state card. Use anywhere a list / panel has nothing to show.
//
//   <EmptyState
//     icon={<SearchIcon />}                          // optional
//     title="No matches"
//     body="Adjust your filters to widen the search."
//     action={{ label: 'Clear filters', onClick: reset }}  // optional
//   />
export default function EmptyState({ icon, title, body, action, dense = false }) {
  return (
    <div className={`w-full glass-card rounded-2xl flex flex-col items-center text-center gap-3 ${
      dense ? 'px-4 py-6' : 'px-6 py-10'
    } animate-enter`}>
      {icon && (
        <div className="w-10 h-10 rounded-full bg-[#0a100c] border border-[#1a2e1f] flex items-center justify-center text-[#3a4f44]">
          {icon}
        </div>
      )}
      {title && (
        <p className="text-sm font-semibold text-[#d1d9d5]">{title}</p>
      )}
      {body && (
        <p className="text-xs text-[#4b6358] leading-relaxed max-w-xs">{body}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 text-[11px] font-semibold tracking-wide text-[#1D9E75] hover:text-[#27c490] cursor-pointer transition-colors"
        >
          {action.label} →
        </button>
      )}
    </div>
  )
}
