import { useState, useRef, lazy, Suspense } from 'react'
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
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

function BookmarkButton({ saved, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
      className={`p-2 rounded-lg border transition-all duration-150 cursor-pointer ${
        saved
          ? 'bg-[#1D9E75]/10 border-[#1D9E75]/30 text-[#1D9E75] hover:bg-[#1D9E75]/20'
          : 'bg-transparent border-[#1a2e1f] text-[#4b6358] hover:border-[#263d2c] hover:text-[#d1d9d5]'
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

  // User preferences (refresh interval + stale threshold)
  const userPrefs = usePrefs()
  const [settingsOpen, setSettingsOpen] = useState(false)

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
  const handleJumpTo = (key) => {
    switch (key) {
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
    <div className="min-h-screen bg-[#080c0a] text-[#d1d9d5] flex flex-col lg:pl-[60px] pb-16 lg:pb-9">

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
      <header className="border-b border-[#1a2e1f] bg-[#080c0a]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <button
            onClick={handleHome}
            className="flex items-center gap-3 shrink-0 cursor-pointer group"
            aria-label="Return to homepage"
          >
            <KairoLogo size={32} />
            <div className="flex flex-col leading-none">
              <span className="font-serif font-bold text-white text-lg tracking-tight group-hover:text-[#d1d9d5] transition-colors">kairo</span>
              <span className="text-[8px] text-[#4b6358] uppercase tracking-[0.25em] mt-0.5">Know the moment.</span>
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
              className="lg:hidden p-2 rounded-lg border border-[#1a2e1f] text-[#4b6358] hover:border-[#1D9E75]/40 hover:text-[#1D9E75] transition-colors cursor-pointer"
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
                    <span className="font-mono text-sm font-black text-white tracking-[0.04em]">
                      {ticker}
                    </span>
                  )}
                  {ticker && marketData.profile?.name && <span className="text-[#263d2c]">·</span>}
                  {marketData.profile?.name && (
                    <span className="text-sm text-[#d1d9d5] font-semibold">{marketData.profile.name}</span>
                  )}
                  {marketData.profile?.exchange && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#1a2e1f] text-[#4b6358] uppercase tracking-widest border border-[#263d2c]">
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">

        {/* Landing hero */}
        {!hasData && !isLoading && (
          <div className="relative flex flex-col items-center text-center gap-6 pt-10 pb-6 animate-fade">
            <HeroMarketBackdrop />
            {/* Ambient glow behind logo */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-48 h-48 rounded-full bg-[#1D9E75] opacity-[0.06] blur-3xl pointer-events-none" />
              <KairoLogo size={60} />
            </div>
            <div>
              <h1 className="font-serif text-4xl sm:text-5xl font-bold text-white tracking-tight mb-2">kairo</h1>
              <p className="text-[#4b6358] tracking-[0.3em] uppercase text-xs">Know the moment.</p>
            </div>
            <p className="text-[#4b6358] text-sm max-w-sm leading-relaxed">
              Real-time market data, interactive charts, technical indicators, and AI-powered analysis — all from a single ticker.
            </p>
            <TickerSearch onSearch={handleSearch} loading={isLoading} />

            {/* Recently viewed chips */}
            {recentTickers.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-[9px] font-semibold text-[#263d2c] uppercase tracking-[0.15em]">Recent</span>
                {recentTickers.map(sym => (
                  <button
                    key={sym}
                    onClick={() => handleSearch(sym)}
                    className="text-[11px] font-bold px-2.5 py-1 bg-[#0f1611] border border-[#1a2e1f] rounded-lg text-[#4b6358] hover:border-[#1D9E75]/40 hover:text-[#1D9E75] transition-all duration-150 cursor-pointer"
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
              <div className="absolute inset-0 rounded-full border border-[#1a2e1f]" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#1D9E75] animate-spin" />
            </div>
            <p className="text-sm text-[#4b6358]">
              Analyzing <span className="text-[#d1d9d5] font-semibold">{ticker}</span>
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[#e24b4a]/10 border border-[#e24b4a]/25 rounded-2xl p-5 text-sm text-[#e24b4a] flex items-start gap-3">
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
                <Recommendation data={aiData} loading={loading.ai} asOf={aiData?.fetchedAt} />
                <AIAnalysis data={aiData} loading={loading.ai} asOf={aiData?.fetchedAt} />
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
          <CompareView open onClose={() => setCompareOpen(false)} />
        </Suspense>
      )}

      {/* ── Footer ── */}
      <footer className="border-t border-[#1a2e1f] mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-[10px] text-[#263d2c] text-center">
          Kairo is for informational purposes only and does not constitute financial advice.
          Market data via Finnhub · Alpha Vantage. AI analysis via Groq.
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

      {/* ── Telemetry ── */}
      <Analytics />
      <SpeedInsights />
    </div>
  )
}
