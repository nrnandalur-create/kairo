import MarketStatusPill from './MarketStatusPill'
import DataTimestamp from './DataTimestamp'

// Sticky bottom bar — visible on lg+ only (mobile uses the bottom nav).
// Aligned with the main content area (left-[60px] to clear the sidebar).
//
// Shows, left → right:
//   ▸ current ticker chip (or "—" when none searched)
//   ▸ last sync timestamp
//   ▸ MarketStatusPill (compact)
//   ▸ data provider attribution
//   ▸ ⌘K hint to open the command palette
export default function StatusBar({ ticker, asOf, onOpenPalette }) {
  return (
    <div className="hidden lg:flex fixed bottom-0 left-[60px] right-0 h-7 z-30 bg-[#0a100c]/90 backdrop-blur-sm border-t border-[#1a2e1f] items-center gap-3 px-4 pointer-events-auto">
      {/* Ticker chip */}
      <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-[#d1d9d5] tabular-nums">
        {ticker ?? '—'}
      </span>
      <span className="text-[#1a2e1f]">·</span>

      {/* Sync time */}
      {asOf ? (
        <DataTimestamp asOf={asOf} prefix="Synced" />
      ) : (
        <span className="font-mono text-[9.5px] tracking-[0.08em] text-[#3a4f44]">Awaiting data</span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Data provider attribution */}
        <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-[#3a4f44] hidden xl:inline">
          Finnhub · Alpha Vantage · Groq
        </span>
        <span className="text-[#1a2e1f] hidden xl:inline">·</span>

        {/* Market status pill (compact) */}
        <MarketStatusPill compact />

        {/* Cmd-K hint */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-1.5 text-[9.5px] font-mono tracking-[0.14em] text-[#4b6358] hover:text-[#1D9E75] transition-colors cursor-pointer"
          title="Open command palette"
        >
          <kbd className="font-mono text-[10px] font-bold border border-[#1a2e1f] rounded px-1 py-0.5 leading-none">⌘K</kbd>
          <span className="uppercase">Search</span>
        </button>
      </div>
    </div>
  )
}
