import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import KairoLogo from './components/KairoLogo'
import TickerSearch from './components/TickerSearch'
import MetricsBar from './components/MetricsBar'
import CandleChart from './components/CandleChart'
import Recommendation from './components/Recommendation'
import AIAnalysis from './components/AIAnalysis'
import CandlePatterns from './components/CandlePatterns'
import IndicatorsGrid from './components/IndicatorsGrid'
import SupportResistance from './components/SupportResistance'
import OptionsScanner from './components/OptionsScanner'
import CoveredCallScanner from './components/CoveredCallScanner'
import NewsFeed from './components/NewsFeed'
import MarketPulse from './components/MarketPulse'
import Watchlist from './components/Watchlist'
// Heavy modals — code-split, only fetched on first open
const Screener     = lazy(() => import('./components/Screener'))
const Portfolio    = lazy(() => import('./components/Portfolio'))
import PriceAlertForm from './components/PriceAlertForm'
import { useWatchlist } from './hooks/useWatchlist'
import { useAlerts } from './hooks/useAlerts'
import { useAuth } from './hooks/useAuth'
import { UserMenu } from './components/auth/UserMenu'
import { supabase } from './lib/supabase'
import { fetchMarket } from './services/finnhub'
import { fetchAnalysis } from './services/analyze'
import { logVerdict, fetchPreviousVerdict } from './services/verdictHistory'
import { calcRSI, calcMACD, calcBBPosition } from './utils/indicators'
import { fetchFundamentals } from './services/fundamentals'
import { getMockOptions, getMockNews } from './mockData'
import Nav from './components/Nav'
import OnboardingBanner from './components/OnboardingBanner'
import WatchlistSentiment from './components/WatchlistSentiment'
import EarningsCalendar from './components/EarningsCalendar'
import PriceTargets from './components/PriceTargets'
import InsiderTrades from './components/InsiderTrades'
const SectorHeatmap = lazy(() => import('./components/SectorHeatmap'))
const CompareView   = lazy(() => import('./components/CompareView'))
import HeroMarketBackdrop from './components/HeroMarketBackdrop'
import MarketStatusPill from './components/MarketStatusPill'
import AIChat from './components/AIChat'
import CommandPalette from './components/CommandPalette'
import StatusBar from './components/StatusBar'
import Toaster from './components/Toaster'
import { useCommandPalette } from './hooks/useCommandPalette'
import { useAutoRefresh } from './hooks/useAutoRefresh'
import { usePrefs } from './hooks/usePrefs'
import { toast } from './utils/toast'
import SettingsModal from './components/SettingsModal'
import AboutModal from './components/AboutModal'
import MyPosition from './components/MyPosition'
import VerdictMemory from './components/VerdictMemory'
import DailyBriefCard from './components/DailyBriefCard'
const PulseView       = lazy(() => import('./components/PulseView'))
const JournalView     = lazy(() => import('./components/JournalView'))
const TrackRecordView = lazy(() => import('./components/TrackRecordView'))
import WelcomeTour from './components/WelcomeTour'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

function BookmarkButton({ saved, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
      className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer ${
        saved
          ? 'bg-[#22B585]/10 border-[#22B585]/30 text-[#22B585] hover:bg-[#22B585]/20'
          : 'bg-transparent border-[var(--c-border)] text-[var(--c-text-faint)] hover:border-[var(--c-border-strong)] hover:text-[var(--c-text)]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        {saved
          ? <path d="M2.5 1.5h9a.5.5 0 01.5.5v10.5l-5-3-5 3V2a.5.5 0 01.5-.5z" fill="currentColor" />
          : <path d="M2.5 1.5h9a.5.5 0 01.5.5v10.5l-5-3-5 3V2a.5.5 0 01.5-.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        }
      </svg>
    </button>
  )
}

const LOADING_NONE   = { market: false, ai: false }
const LOADING_MARKET = { market: true,  ai: false }
const LOADING_AI     = { market: false, ai: true  }

export default function App() {
  const [ticker, setTicker]     = useState(null)
  const [loading, setLoading]   = useState(LOADING_NONE)
  const [marketData, setMarketData] = useState(null)
  const [aiData, setAiData]     = useState(null)
  const [previousVerdict, setPreviousVerdict] = useState(null)
  const [fundamentalsData, setFundamentalsData] = useState(null)
  const [error, setError]       = useState(null)
  const { user }       = useAuth()
  const { watchlist: watchlistRows, addTicker, removeTicker, updateNote, setAlert: setWatchlistAlert } = useWatchlist(user?.id)
  const [recentTickers, setRecentTickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kairo_recent') ?? '[]') }
    catch { return [] }
  })
  const alerts         = useAlerts()
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('kairo_onboarded'))
  const [screenerOpen,  setScreenerOpen]  = useState(false)
  const [portfolioOpen, setPortfolioOpen] = useState(false)
  const [sectorsOpen,   setSectorsOpen]   = useState(false)
  const [compareOpen,   setCompareOpen]   = useState(false)
  const [compareSeed,   setCompareSeed]   = useState(null)
  const [pulseOpen,     setPulseOpen]     = useState(false)
  const [journalOpen,   setJournalOpen]   = useState(false)
  const [trackRecordOpen, setTrackRecordOpen] = useState(false)

  const isLoading = loading.market || loading.ai

  const handleSearch = async (sym) => {
    setTicker(sym)
    setError(null)
    setAiData(null)
    setFundamentalsData(null)
    setMarketData(null)
    setLoading(LOADING_MARKET)

    try {
      const { quote, profile, metrics, candles, synthetic, news } = await fetchMarket(sym)

      if (!quote || quote.c == null) {
        setError(`No data found for "${sym}". Check the ticker symbol and try again.`)
        setLoading(LOADING_NONE)
        return
      }

      // Persist to recently viewed (capped at 5, most recent first)
      setRecentTickers(prev => {
        const next = [sym, ...prev.filter(t => t !== sym)].slice(0, 5)
        localStorage.setItem('kairo_recent', JSON.stringify(next))
        return next
      })

      setMarketData({ quote, profile, metrics, candles, synthetic, news })
      setLoading(LOADING_AI)

      let analysisResult = null
      await Promise.allSettled([
        fetchAnalysis({ ticker: sym, quote, profile, metrics, candles })
          .then(data => { analysisResult = data; setAiData(data) })
          .catch(() => {}),
        fetchFundamentals(sym)
          .then(setFundamentalsData)
          .catch(() => {}),
      ])

      // Log signal to Supabase and trigger email if it changed (fire-and-forget)
      if (user && analysisResult?.verdict && watchlistRows.some(w => w.ticker === sym)) {
        supabase.functions.invoke('signal-alert', {
          body: {
            ticker:     sym,
            signal:     analysisResult.verdict,
            confidence: analysisResult.confidence,
            entryPrice: analysisResult.entryPrice,
            stopLoss:   analysisResult.stopLoss,
            riskLevel:  analysisResult.riskLevel,
          },
        }).catch(() => {})
      }

      // Log this verdict view + fetch the previous one for Verdict Memory.
      // Both run for any signed-in user, not just watchlist members — the
      // history fuels the Verdict Memory banner, Track Record, and Replay.
      if (user && analysisResult?.recommendation) {
        const indicators = {
          rsi:  calcRSI(candles),
          macd: calcMACD(candles)?.macdLine ?? null,
          bb:   calcBBPosition(candles),
        }
        const previous = await fetchPreviousVerdict({ userId: user.id, ticker: sym })
        setPreviousVerdict(previous)
        logVerdict({
          userId:      user.id,
          ticker:      sym,
          aiData:      analysisResult,
          marketData:  { quote },
          indicators,
          profile,
        }).catch(() => {})
      } else {
        setPreviousVerdict(null)
      }

      setLoading(LOADING_NONE)
    } catch (err) {
      const msg = err.message ?? ''
      // The server already sends friendly per-status messages — surface them
      // verbatim unless we recognize a specific class of failure we can phrase
      // better than the server did.
      setError(
        msg.includes('401') || msg.includes('403') || /api key/i.test(msg)
          ? 'Invalid Finnhub API key. Check your FINNHUB_API_KEY in Vercel environment variables.'
          : /no data found/i.test(msg)
          ? msg                            // server's own "No data found for X" — use as-is
          : msg.includes('429')
          ? 'You\'re searching too quickly. Wait a moment and try again.'
          : msg || 'Failed to fetch market data. Please try again.'
      )
      setLoading(LOADING_NONE)
    }
  }

  const hasData  = !!marketData

  const handleHome = () => {
    setTicker(null)
    setMarketData(null)
    setAiData(null)
    setFundamentalsData(null)
    setError(null)
    setLoading(LOADING_NONE)
  }

  const scrollTo = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const handleAlerts = () => {
    if (hasData) scrollTo('section-alerts')
    else toast.show('Search a ticker to set price alerts')
  }

  const handleNews = () => {
    if (hasData) scrollTo('section-news')
    else toast.show('Search a ticker to view news')
  }

  // User preferences (refresh interval + stale threshold + theme + glass)
  const userPrefs = usePrefs()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  // Apply theme + translucency to <html> so the CSS vars in index.css flip.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', userPrefs.theme ?? 'dark')
    root.style.setProperty('--glass-mult', String(userPrefs.glassMult ?? 1))
  }, [userPrefs.theme, userPrefs.glassMult])

  // Shareable URLs: /t/TICKER hydrates that ticker on load + sync the URL
  // when the user navigates between tickers.
  useEffect(() => {
    const fromPath = () => {
      const match = window.location.pathname.match(/^\/t\/([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\/?$/i)
      if (match) handleSearch(match[1].toUpperCase())
    }
    fromPath()
    const onPop = () => fromPath()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push /t/TICKER into the URL when a ticker becomes active.
  useEffect(() => {
    if (!ticker) return
    const desired = `/t/${ticker}`
    if (window.location.pathname !== desired) {
      window.history.pushState({ ticker }, '', desired)
    }
  }, [ticker])


  // Background refresh — re-fetch market data only (not AI / fundamentals).
  // Interval is configurable via Settings. Skips when the tab is hidden
  // or the market is closed.
  const refreshMarketOnly = async () => {
    if (!ticker) return
    try {
      const { quote, profile, metrics, candles, synthetic, news } = await fetchMarket(ticker)
      if (!quote || quote.c == null) return
      setMarketData({ quote, profile, metrics, candles, synthetic, news })
    } catch {
      // Silent — the existing DataTimestamp will turn amber on its own
      // once data crosses the stale threshold.
    }
  }
  // refreshMs === 0 disables auto-refresh entirely.
  useAutoRefresh({
    key:        userPrefs.refreshMs > 0 ? ticker : null,
    refresh:    refreshMarketOnly,
    intervalMs: userPrefs.refreshMs || 300_000,
  })

  // Cmd-K command palette + jump table
  const palette = useCommandPalette()

  // Single-key shortcuts. Skipped when the user is typing into an input,
  // textarea, contenteditable, or has a modifier key down. ⌘K stays as
  // the global palette opener — these are complementary, not replacements.
  useEffect(() => {
    const isTyping = (el) => {
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
    }
    const onKey = (e) => {
      if (isTyping(document.activeElement)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'p': setPortfolioOpen(true); break
        case 's': setSectorsOpen(true);   break
        case 'c': setCompareOpen(true);   break
        case 'r': setScreenerOpen(true);  break
        case 'u': setPulseOpen(true);     break
        case 'j': setJournalOpen(true);   break
        case ',': setSettingsOpen(true);  break
        case '?': setAboutOpen(true);     break
        case '/': e.preventDefault(); palette.setOpen(true); break
        default: return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const handleJumpTo = (key) => {
    switch (key) {
      case 'pulse':     setPulseOpen(true);     break
      case 'journal':   setJournalOpen(true);   break
      case 'receipts':  setTrackRecordOpen(true); break
      case 'screener':  setScreenerOpen(true);  break
      case 'portfolio': setPortfolioOpen(true); break
      case 'sectors':   setSectorsOpen(true);   break
      case 'compare':   setCompareOpen(true);   break
      case 'alerts':    handleAlerts();         break
      case 'news':      handleNews();           break
      default:          break
    }
  }

  const activeNav = screenerOpen  ? 'screener'
    : portfolioOpen ? 'portfolio'
    : sectorsOpen   ? 'sectors'
    : compareOpen   ? 'compare'
    : !hasData && !isLoading ? 'home'
    : null

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col lg:pl-[60px] pb-16 lg:pb-9">

      <Nav
        activeKey={activeNav}
        onHome={handleHome}
        onSettings={() => setSettingsOpen(true)}
        onScreener={() => setScreenerOpen(true)}
        onPortfolio={() => setPortfolioOpen(true)}
        onSectors={() => setSectorsOpen(true)}
        onCompare={() => setCompareOpen(true)}
        onAlerts={handleAlerts}
        onNews={handleNews}
      />

      {/* ── Header ── */}
      <header className="glass sticky top-0 z-20" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <button
            onClick={handleHome}
            className="flex items-center gap-3 shrink-0 cursor-pointer group"
            aria-label="Return to homepage"
          >
            <KairoLogo size={32} />
            <div className="flex flex-col leading-none">
              <span className="font-serif font-bold text-[var(--c-text-strong)] text-lg tracking-tight group-hover:text-[var(--c-text)] transition-colors">kairo</span>
              <span className="text-[8px] text-[var(--c-text-faint)] uppercase tracking-[0.25em] mt-0.5">Know the moment.</span>
            </div>
          </button>

          <div className="ml-3">
            <MarketStatusPill />
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">
            {/* Mobile palette entry — gives phones the same Cmd-K trigger desktop has in the StatusBar */}
            <button
              type="button"
              onClick={() => palette.setOpen(true)}
              aria-label="Open command palette"
              title="Search ticker or jump to section"
              className="lg:hidden p-2 rounded-lg border border-[var(--c-border)] text-[var(--c-text-faint)] hover:border-[#22B585]/40 hover:text-[#22B585] transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {hasData && (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  {ticker && (
                    <span className="font-mono text-sm font-black text-[var(--c-text-strong)] tracking-[0.04em]">
                      {ticker}
                    </span>
                  )}
                  {ticker && marketData.profile?.name && <span className="text-[var(--c-text-fainter)]">·</span>}
                  {marketData.profile?.name && (
                    <span className="text-sm text-[var(--c-text)] font-semibold">{marketData.profile.name}</span>
                  )}
                  {marketData.profile?.exchange && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] uppercase tracking-widest border border-[var(--c-border-strong)]">
                      {marketData.profile.exchange}
                    </span>
                  )}
                </div>
                <BookmarkButton
                  saved={watchlistRows.some(w => w.ticker === ticker)}
                  onToggle={() => watchlistRows.some(w => w.ticker === ticker) ? removeTicker(ticker) : addTicker(ticker)}
                />
                <TickerSearch onSearch={handleSearch} loading={isLoading} />
              </>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">

        {/* Landing hero */}
        {!hasData && !isLoading && (
          <div className="relative flex flex-col items-center text-center gap-6 pt-10 pb-6 animate-fade">
            <HeroMarketBackdrop />
            {/* Ambient glow behind logo */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-48 h-48 rounded-full bg-[#22B585] opacity-[0.06] blur-3xl pointer-events-none" />
              <KairoLogo size={60} />
            </div>
            <div>
              <h1 className="font-serif text-4xl sm:text-5xl font-bold text-[var(--c-text-strong)] tracking-tight mb-2">kairo</h1>
              <p className="text-[var(--c-text-faint)] tracking-[0.3em] uppercase text-xs">Know the moment.</p>
            </div>
            <p className="text-[var(--c-text-faint)] text-sm max-w-sm leading-relaxed">
              Real-time market data, interactive charts, technical indicators, and AI-powered analysis — all from a single ticker.
            </p>
            <TickerSearch onSearch={handleSearch} loading={isLoading} />

            {/* Recently viewed chips — or a "Try AAPL" CTA on first visit */}
            {recentTickers.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-[9px] font-semibold text-[var(--c-text-fainter)] uppercase tracking-[0.15em]">Recent</span>
                {recentTickers.map(sym => (
                  <button
                    key={sym}
                    onClick={() => handleSearch(sym)}
                    className="text-[11px] font-bold px-2.5 py-1 bg-[var(--c-card)] border border-[var(--c-border)] rounded-lg text-[var(--c-text-faint)] hover:border-[#22B585]/40 hover:text-[#22B585] transition-all duration-150 cursor-pointer"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-[9px] font-semibold text-[var(--c-text-fainter)] uppercase tracking-[0.15em]">Try</span>
                {['AAPL', 'NVDA', 'SPY'].map(sym => (
                  <button
                    key={sym}
                    onClick={() => handleSearch(sym)}
                    className="text-[11px] font-bold px-2.5 py-1 bg-[var(--c-card)] border border-[var(--c-border)] rounded-lg text-[var(--c-text-faint)] hover:border-[#22B585]/40 hover:text-[#22B585] transition-all duration-150 cursor-pointer"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Onboarding banner — first visit only */}
        {!hasData && !isLoading && !onboarded && (
          <OnboardingBanner onDismiss={() => {
            localStorage.setItem('kairo_onboarded', '1')
            setOnboarded(true)
          }} />
        )}

        {/* Daily brief cards — visible on landing for signed-in users */}
        {!hasData && !isLoading && user && (
          <>
            <DailyBriefCard userId={user.id} kind="open"  onJumpToTicker={handleSearch} />
            <DailyBriefCard userId={user.id} kind="close" onJumpToTicker={handleSearch} />
          </>
        )}

        {/* Watchlist — visible on landing only, above market pulse */}
        {!hasData && !isLoading && (
          <Watchlist
            rows={watchlistRows}
            onSelect={handleSearch}
            onRemove={removeTicker}
            onNoteUpdate={updateNote}
            onAlertUpdate={user ? setWatchlistAlert : undefined}
          />
        )}

        {/* Watchlist Sentiment — shown when watchlist has tickers */}
        {!hasData && !isLoading && watchlistRows.length > 0 && (
          <WatchlistSentiment tickers={watchlistRows.map(r => r.ticker)} />
        )}

        {/* Market Pulse dashboard — visible on landing only */}
        {!hasData && !isLoading && <MarketPulse />}

        {/* Loading — market data */}
        {loading.market && (
          <div className="flex flex-col items-center gap-5 py-32 animate-fade">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border border-[var(--c-border)]" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#22B585] animate-spin" />
            </div>
            <p className="text-sm text-[var(--c-text-faint)]">
              Analyzing <span className="text-[var(--c-text)] font-semibold">{ticker}</span>
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[#ef5454]/10 border border-[#ef5454]/25 rounded-2xl p-5 text-sm text-[#ef5454] flex items-start gap-3">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {hasData && !loading.market && (
          <ErrorBoundary>
            {/* Full width — Price + Metrics */}
            <MetricsBar
              ticker={ticker}
              quote={marketData.quote}
              profile={marketData.profile}
              metrics={marketData.metrics}
              candles={marketData.candles}
              asOf={marketData.fetchedAt}
            />

            {/* Two-column on desktop: left = chart/indicators, right = AI */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* Left column — chart, technical & fundamentals */}
              <div className="flex flex-col gap-5">
                <ErrorBoundary>
                  <CandleChart candles={marketData.candles} synthetic={marketData.synthetic} />
                </ErrorBoundary>
                <IndicatorsGrid candles={marketData.candles} loading={false} asOf={marketData.fetchedAt} />
                <SupportResistance
                  candles={marketData.candles}
                  currentPrice={marketData.quote?.c}
                  asOf={marketData.fetchedAt}
                />
                <EarningsCalendar data={fundamentalsData?.earnings} loading={loading.ai} />
                <PriceTargets
                  data={fundamentalsData?.targets}
                  currentPrice={marketData.quote?.c}
                  loading={loading.ai}
                />
              </div>

              {/* Right column — AI recommendation & analysis */}
              <div className="flex flex-col gap-5">
                {previousVerdict && aiData && (
                  <VerdictMemory
                    previous={previousVerdict}
                    current={aiData}
                    currentPrice={marketData.quote?.c}
                  />
                )}
                <Recommendation
                  data={aiData}
                  loading={loading.ai}
                  asOf={aiData?.fetchedAt}
                  ticker={ticker}
                  onCompare={(tickers) => { setCompareSeed(tickers); setCompareOpen(true) }}
                />
                <AIAnalysis data={aiData} loading={loading.ai} asOf={aiData?.fetchedAt} />
                {ticker && (
                  <MyPosition
                    ticker={ticker}
                    aiData={aiData}
                    currentPrice={marketData.quote?.c}
                    userId={user?.id}
                  />
                )}
                {aiData && <AIChat ticker={ticker} context={aiData} />}
                <CandlePatterns data={aiData?.patterns} loading={loading.ai} />
                <div id="section-alerts">
                  <PriceAlertForm
                    ticker={ticker}
                    currentPrice={marketData.quote?.c}
                    getAlert={alerts.getAlert}
                    setAlert={alerts.setAlert}
                    clearAlert={alerts.clearAlert}
                  />
                </div>
              </div>
            </div>

            {/* Full width — Insider transactions */}
            <InsiderTrades data={fundamentalsData?.insider} loading={loading.ai} />

            {/* Full width — Options scanner */}
            <OptionsScanner data={getMockOptions(ticker, marketData.quote?.c)} />

            {/* Full width — Covered call scanner */}
            <CoveredCallScanner currentPrice={marketData.quote?.c} ticker={ticker} />

            {/* Full width — News feed */}
            <div id="section-news">
              <NewsFeed data={marketData.news} loading={loading.ai} asOf={marketData.fetchedAt} />
            </div>
          </ErrorBoundary>
        )}
      </main>

      {/* ── Modals (code-split via React.lazy) ── */}
      {/* Conditional render so each modal's JS chunk is only fetched on first open. */}
      {screenerOpen && (
        <Suspense fallback={null}>
          <Screener open onClose={() => setScreenerOpen(false)} onAnalyze={handleSearch} />
        </Suspense>
      )}
      {portfolioOpen && (
        <Suspense fallback={null}>
          <Portfolio open onClose={() => setPortfolioOpen(false)} onAnalyze={handleSearch} userId={user?.id} />
        </Suspense>
      )}
      {sectorsOpen && (
        <Suspense fallback={null}>
          <SectorHeatmap open onClose={() => setSectorsOpen(false)} onAnalyze={handleSearch} />
        </Suspense>
      )}
      {compareOpen && (
        <Suspense fallback={null}>
          <CompareView open onClose={() => { setCompareOpen(false); setCompareSeed(null) }} initialTickers={compareSeed} />
        </Suspense>
      )}
      {pulseOpen && (
        <Suspense fallback={null}>
          <PulseView
            open
            onClose={() => setPulseOpen(false)}
            watchlistTickers={watchlistRows.map(r => r.ticker)}
            userId={user?.id}
            onSelectTicker={(sym) => { setPulseOpen(false); handleSearch(sym) }}
          />
        </Suspense>
      )}
      {journalOpen && (
        <Suspense fallback={null}>
          <JournalView
            open
            onClose={() => setJournalOpen(false)}
            userId={user?.id}
            onSelectTicker={handleSearch}
          />
        </Suspense>
      )}
      {trackRecordOpen && (
        <Suspense fallback={null}>
          <TrackRecordView open onClose={() => setTrackRecordOpen(false)} />
        </Suspense>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-[var(--c-border)] mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-[10px] text-[var(--c-text-fainter)] flex items-center justify-center gap-2 flex-wrap">
          <span>Kairo is for informational purposes only and does not constitute financial advice.</span>
          <span className="text-[var(--c-border-strong)]">·</span>
          <span>Market data via Finnhub · Alpha Vantage. AI analysis via Groq.</span>
          <button
            type="button"
            onClick={() => setAboutOpen(true)}
            aria-label="About Kairo"
            title="Methodology, data sources, disclaimer"
            className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full border border-[var(--c-border-strong)] text-[var(--c-text-faint)] hover:text-[#22B585] hover:border-[#22B585]/50 transition-colors cursor-pointer"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
              <circle cx="4" cy="1.6" r="0.85" fill="currentColor" />
              <rect x="3.3" y="3.4" width="1.4" height="3.4" rx="0.55" fill="currentColor" />
            </svg>
          </button>
        </div>
      </footer>

      {/* ── Toast queue ── */}
      <Toaster />

      {/* ── Command palette ── */}
      <CommandPalette
        open={palette.open}
        onClose={() => palette.setOpen(false)}
        onSelectTicker={(sym) => handleSearch(sym)}
        onJumpTo={handleJumpTo}
      />

      {/* ── Bottom status bar ── */}
      <StatusBar
        ticker={ticker}
        asOf={marketData?.fetchedAt}
        onOpenPalette={() => palette.setOpen(true)}
      />

      {/* ── Settings ── */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ── About / methodology ── */}
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* ── First-visit welcome tour (auto-opens once) ── */}
      <WelcomeTour />

      {/* ── Telemetry ── */}
      <Analytics />
      <SpeedInsights />
    </div>
  )
}
