function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 7L8 1.5 14.5 7v7.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 15.5V10h5v5.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  )
}

function ScreenerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.5 3.5h13M4 8h8M6.5 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function PortfolioIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 8V2.5M8 8l4.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function AlertsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5A4 4 0 0112 5.5v3.3l1.2 2H2.8l1.2-2V5.5A4 4 0 018 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M6.5 13a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function NewsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 6h6M5 9h6M5 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function SectorsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9"   y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="1.5" y="9"   width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9"   y="9"   width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

function CompareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5v13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 1.5"/>
      <rect x="1.5" y="4"   width="5"   height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9.5" y="4"   width="5"   height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

// Desktop sidebar shows all items; mobile bottom bar shows only the first 5
const NAV_ITEMS = [
  { key: 'home',      label: 'Home',      Icon: HomeIcon      },
  { key: 'screener',  label: 'Screener',  Icon: ScreenerIcon  },
  { key: 'portfolio', label: 'Portfolio', Icon: PortfolioIcon },
  { key: 'sectors',   label: 'Sectors',   Icon: SectorsIcon   },
  { key: 'compare',   label: 'Compare',   Icon: CompareIcon   },
  { key: 'alerts',    label: 'Alerts',    Icon: AlertsIcon    },
  { key: 'news',      label: 'News',      Icon: NewsIcon      },
]
const MOBILE_NAV_ITEMS = NAV_ITEMS.slice(0, 5)

const SETTINGS_ITEM = { key: 'settings', label: 'Settings', Icon: SettingsIcon }

function SidebarItem({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={item.label}
      className={`relative flex items-center gap-3.5 w-full pl-[18px] pr-4 py-3 transition-colors duration-150 cursor-pointer ${
        active
          ? 'text-[#1D9E75]'
          : 'text-[var(--c-text-faint)] hover:text-[var(--c-text)] hover:bg-[var(--c-input-bg)]'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#1D9E75] rounded-r-full" />
      )}
      <span className="shrink-0">
        <item.Icon />
      </span>
      <span className="text-[11px] font-semibold whitespace-nowrap leading-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
        {item.label}
      </span>
    </button>
  )
}

function BottomItem({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 flex-1 py-2.5 transition-colors duration-150 cursor-pointer ${
        active ? 'text-[#1D9E75]' : 'text-[var(--c-text-faint)] active:text-[var(--c-text)]'
      }`}
    >
      <item.Icon />
      <span className="text-[9px] font-semibold tracking-wide">{item.label}</span>
    </button>
  )
}

export default function Nav({
  activeKey,
  onHome, onScreener, onPortfolio, onAlerts, onNews, onSectors, onCompare, onSettings,
}) {
  const handlers = {
    home:      onHome,
    screener:  onScreener,
    portfolio: onPortfolio,
    alerts:    onAlerts,
    news:      onNews,
    sectors:   onSectors,
    compare:   onCompare,
    settings:  onSettings ?? (() => {}),
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <nav className="group fixed left-0 top-0 bottom-0 z-30 hidden lg:flex flex-col w-[60px] hover:w-[200px] transition-[width] duration-200 ease-out overflow-hidden bg-[var(--c-bg)] border-r border-[var(--c-border)]">

        {/* Spacer matches header height */}
        <div className="h-[57px] shrink-0 border-b border-[var(--c-border)]" />

        {/* Main nav items */}
        <div className="flex-1 flex flex-col py-2 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <SidebarItem
              key={item.key}
              item={item}
              active={activeKey === item.key}
              onClick={handlers[item.key]}
            />
          ))}
        </div>

        {/* Settings pinned at bottom */}
        <div className="border-t border-[var(--c-border)] py-2 shrink-0">
          <SidebarItem item={SETTINGS_ITEM} active={false} onClick={handlers.settings} />
        </div>
      </nav>

      {/* ── Mobile bottom tab bar (first 5 items only) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex lg:hidden bg-[var(--c-bg)] border-t border-[var(--c-border)]">
        {MOBILE_NAV_ITEMS.map(item => (
          <BottomItem
            key={item.key}
            item={item}
            active={activeKey === item.key}
            onClick={handlers[item.key]}
          />
        ))}
      </nav>
    </>
  )
}
