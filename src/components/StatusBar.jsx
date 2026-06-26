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
    <div data-statusbar className="glass hidden lg:flex fixed bottom-0 left-[60px] right-0 h-9 z-30 items-center gap-3 px-4 pointer-events-auto" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: 'none', borderLeft: 'none', borderRight: 'none', transition: 'left 200ms ease-out, background 200ms ease' }}>
      {/* Ticker chip */}
      <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-[var(--c-text)] tabular-nums">
        {ticker ?? '—'}
      </span>
      <span className="text-[var(--c-text-fainter)]">·</span>

      {/* Sync time — same "Updated" verb used on the data cards for consistency */}
      {asOf ? (
        <DataTimestamp asOf={asOf} prefix="Updated" />
      ) : (
        <span className="font-mono text-[10.5px] text-[var(--c-text-muted)]">Awaiting data</span>
      )}

      <div className="ml-auto flex items-center gap-3">
        {/* Data provider attribution */}
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--c-text-muted)] hidden xl:inline">
          Finnhub · Alpha Vantage · Groq
        </span>
        <span className="text-[var(--c-text-fainter)] hidden xl:inline">·</span>

        {/* Market status pill */}
        <MarketStatusPill compact />

        {/* Cmd-K hint */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-1.5 text-[10.5px] font-mono tracking-[0.1em] text-[var(--c-text-muted)] hover:text-[#22B585] transition-colors cursor-pointer"
          title="Open command palette"
        >
          <kbd className="font-mono text-[10.5px] font-bold border border-[var(--c-border-strong)] rounded px-1.5 py-0.5 leading-none">⌘K</kbd>
          <span className="uppercase tracking-[0.14em]">Search</span>
        </button>
      </div>
    </div>
  )
}
