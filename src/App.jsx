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
import { fetchVerdict, fetchDetailedAnalysis } from './services/analyze'
import { logVerdict, fetchPreviousVerdict } from './services/verdictHistory'
import { calcRSI, calcMACD, calcBBPosition } from './utils/indicators'
import { fetchFundamentals } from './services/fundamentals'
import { getMockNews } from './mockData'
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
import StickyTickerBar from './components/StickyTickerBar'
import DailyBriefCard from './components/DailyBriefCard'
const PulseView       = lazy(() => import('./components/PulseView'))
const JournalView     = lazy(() => import('./components/JournalView'))
const TrackRecordView = lazy(() => import('./components/TrackRecordView'))
const DiscoverView    = lazy(() => import('./components/DiscoverView'))
const PaperPitView    = lazy(() => import('./components/PaperPitView'))
const ReplayView      = lazy(() => import('./components/ReplayView'))
import WelcomeTour from './components/WelcomeTour'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
// ── Billing / feature gating ────────────────────────────────────────────────
import UpgradeOverlay from './components/UpgradeOverlay'
import ProBadge from './components/ProBadge'
import { useSubscription } from './hooks/useSubscription'
import { useSearchQuota } from './hooks/useSearchQuota'
const PricingPage        = lazy(() => import('./components/PricingPage'))
const AccountBillingPage = lazy(() => import('./components/AccountBillingPage'))

function BookmarkButton({ saved, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
      className={`flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg border transition-all duration-150 cursor-pointer ${
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

// Same-ticker result cache. When the user re-searches a symbol they've just
// viewed we serve directly from this map instead of round-tripping every
// API again — matches the user's mental model ("I just looked at AAPL,
// clicking AAPL again should be instant"). Two windows:
//   MARKET_TTL_MS  — quote/candles/news; short because live price moves
//   ANALYSIS_TTL_MS — Groq verdict; longer because it's expensive to redo
const MARKET_TTL_MS   = 30_000    // 30 s
const ANALYSIS_TTL_MS = 5 * 60_000 // 5 min

export default function App() {
  const [ticker, setTicker]     = useState(null)
  const [loading, setLoading]   = useState(LOADING_NONE)
  const [marketData, setMarketData] = useState(null)
  const [aiData, setAiData]     = useState(null)
  const [aiError, setAiError]   = useState(null)
  // Detailed AI Analysis — a separate Groq call with its own prompt.
  // Feeds the AIAnalysis panel independently of the verdict card.
  const [analysisData,  setAnalysisData]  = useState(null)
  const [analysisError, setAnalysisError] = useState(null)
  const [previousVerdict, setPreviousVerdict] = useState(null)
  const [bottomTab, setBottomTab] = useState('news')  // tabbed bottom shelf: news | insider | options | covered-calls
  const [fundamentalsData, setFundamentalsData] = useState(null)
  const [error, setError]       = useState(null)

  // Abort controller for the current handleSearch. Rapid ticker switches
  // abort the previous one so its resolved fetches don't call setState with
  // stale data. All three service fetches accept the same signal.
  const searchAbortRef = useRef(null)
  // In-memory cache — see MARKET_TTL_MS / ANALYSIS_TTL_MS at module scope.
  // Structure: { [ticker]: { market, ai, fundamentals, marketAt, aiAt, fundamentalsAt } }
  const cacheRef = useRef(new Map())
  const { user }       = useAuth()
  // Subscription entitlements. `isPro` gates every locked feature; the
  // permanent developer override lives inside the hook (see file for the
  // canonical explanation).
  const { isPro } = useSubscription()
  const quota     = useSearchQuota({ isPro })

  // Register a verdict reveal exactly once per ticker+day when the
  // Recommendation actually has data. Keyed by `${date}::${ticker}` so
  // re-searching the same ticker inside the day doesn't burn another slot.
  const revealedRef = useRef(new Set())
  useEffect(() => {
    if (isPro || !aiData?.verdict || !ticker) return
    const key = `${quota.date}::${ticker}`
    if (revealedRef.current.has(key)) return
    revealedRef.current.add(key)
    quota.registerVerdictReveal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiData?.verdict, ticker, isPro, quota.date])
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
  const [discoverOpen,    setDiscoverOpen]    = useState(false)
  const [paperOpen,       setPaperOpen]       = useState(false)
  const [replayOpen,      setReplayOpen]      = useState(false)

  const isLoading = loading.market || loading.ai

  const handleSearch = async (sym) => {
    // ── Free-tier daily search quota ────────────────────────────────────
    // Registering the (deduped) symbol first so re-searching an already-
    // viewed ticker inside the day doesn't count twice against the limit.
    const reg = quota.registerSearch(sym)
    if (!reg.ok && !isPro) {
      setError(`You've hit the free-tier limit of ${quota.limits.search} unique ticker searches today. Upgrade to Kairo Pro for unlimited searches.`)
      return
    }

    // Abort any in-flight previous search so its late setState calls can't
    // overwrite the state we're about to set for the new ticker.
    if (searchAbortRef.current) searchAbortRef.current.abort('ticker:switched')
    const controller = new AbortController()
    searchAbortRef.current = controller
    const { signal } = controller

    // Guard state-setters against stale writes — the AbortController triggers
    // the underlying fetch to reject with AbortError, but there's still a
    // microtask window between abort and the promise settling.
    const isCurrent = () => searchAbortRef.current === controller && !signal.aborted

    setTicker(sym)
    setError(null)
    setAiData(null)
    setAiError(null)
    setAnalysisData(null)
    setAnalysisError(null)
    setFundamentalsData(null)
    setMarketData(null)
    setLoading(LOADING_MARKET)

    // ── Serve fresh cache hits without any network round-trip ─────────────
    const cached = cacheRef.current.get(sym)
    const now    = Date.now()
    if (cached?.market && (now - cached.marketAt) < MARKET_TTL_MS) {
      setMarketData(cached.market)
      // Hydrate whichever of the two AI panels we have fresh cache for.
      // Each is cached independently so a stale verdict doesn't force
      // a re-fetch of a still-fresh detailed analysis (and vice-versa).
      if (cached.ai && (now - cached.aiAt) < ANALYSIS_TTL_MS) {
        setAiData(cached.ai)
      }
      if (cached.analysis && (now - cached.analysisAt) < ANALYSIS_TTL_MS) {
        setAnalysisData(cached.analysis)
      }
      if (
        cached.ai       && (now - cached.aiAt)       < ANALYSIS_TTL_MS &&
        cached.analysis && (now - cached.analysisAt) < ANALYSIS_TTL_MS
      ) {
        setFundamentalsData(cached.fundamentals ?? null)
        setLoading(LOADING_NONE)
        setRecentTickers(prev => {
          const next = [sym, ...prev.filter(t => t !== sym)].slice(0, 5)
          localStorage.setItem('kairo_recent', JSON.stringify(next))
          return next
        })
        return
      }
      // Have market cache but at least one AI call needs refreshing —
      // fall through into the AI-fetch block.
    }

    try {
      let marketPayload
      if (cached?.market && (now - cached.marketAt) < MARKET_TTL_MS) {
        marketPayload = cached.market
      } else {
        marketPayload = await fetchMarket(sym, { signal })
        if (!isCurrent()) return
      }
      const { quote, profile, metrics, candles, synthetic, syntheticReason, news } = marketPayload

      if (!quote || quote.c == null) {
        if (!isCurrent()) return
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

      setMarketData(marketPayload)
      // Refresh the cache entry with the market payload we just used.
      cacheRef.current.set(sym, {
        ...(cacheRef.current.get(sym) ?? {}),
        market:   marketPayload,
        marketAt: Date.now(),
      })
      setLoading(LOADING_AI)

      let analysisResult = null
      setAiError(null)
      setAnalysisError(null)
      const marketCtx = { ticker: sym, quote, profile, metrics, candles, synthetic }
      await Promise.allSettled([
        // 1. Punchy verdict — feeds the Recommendation panel.
        fetchVerdict(marketCtx, { signal })
          .then(data => {
            if (!isCurrent()) return
            analysisResult = data
            setAiData(data)
            const prev = cacheRef.current.get(sym) ?? {}
            cacheRef.current.set(sym, { ...prev, ai: data, aiAt: Date.now() })
          })
          .catch(err => {
            // Silent on user-initiated aborts; visible on real failures.
            if (err?.name === 'AbortError' || !isCurrent()) return
            setAiError(err?.message ?? 'Analysis request failed')
          }),
        // 2. Detailed indicator breakdown — feeds the AI Analysis panel.
        //    Independent of the verdict call; cached separately so a
        //    verdict re-fetch doesn't force this to reload (and vice-versa).
        fetchDetailedAnalysis(marketCtx, { signal })
          .then(data => {
            if (!isCurrent()) return
            setAnalysisData(data)
            const prev = cacheRef.current.get(sym) ?? {}
            cacheRef.current.set(sym, { ...prev, analysis: data, analysisAt: Date.now() })
          })
          .catch(err => {
            if (err?.name === 'AbortError' || !isCurrent()) return
            setAnalysisError(err?.message ?? 'Detailed analysis failed')
          }),
        fetchFundamentals(sym, { signal })
          .then(data => {
            if (!isCurrent()) return
            setFundamentalsData(data)
            const prev = cacheRef.current.get(sym) ?? {}
            cacheRef.current.set(sym, { ...prev, fundamentals: data, fundamentalsAt: Date.now() })
          })
          .catch(() => { /* fundamentals is best-effort; UI has its own empty states */ }),
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
          rsi:  calcRSI(candles, 14, quote?.c),
          macd: calcMACD(candles, quote?.c)?.macdLine ?? null,
          bb:   calcBBPosition(candles, 20, quote?.c),
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

      if (isCurrent()) setLoading(LOADING_NONE)
    } catch (err) {
      // Swallow aborts silently — the user already navigated to a new ticker,
      // showing a "cancelled" error for their previous search would be confusing.
      if (err?.name === 'AbortError' || !isCurrent()) return
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
    setAiError(null)
    setAnalysisData(null)
    setAnalysisError(null)
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
  // or the market is closed. Captures the ticker at call time and drops
  // the response if the user has since switched — otherwise a slow refresh
  // could clobber the new ticker's freshly-fetched quote.
  const refreshMarketOnly = async () => {
    const t = ticker
    if (!t) return
    try {
      const data = await fetchMarket(t)
      if (!data.quote || data.quote.c == null) return
      // Bail if ticker changed while we were awaiting.
      if (t !== ticker) return
      setMarketData(data)
      // Warm the cache so a re-search of `t` inside the TTL is free.
      cacheRef.current.set(t, {
        ...(cacheRef.current.get(t) ?? {}),
        market:   data,
        marketAt: Date.now(),
      })
    } catch {
      // Silent — the existing DataTimestamp will turn amber on its own
      // once data crosses the stale threshold.
    }
  }
  // refreshMs === 0 disables auto-refresh entirely.
  useAutoRefresh({
    key:        userPrefs.refreshMs > 0 ? ticker : null,
    refresh:    refreshMarketOnly,
    // null = adaptive (hook picks 30s during market hours, 90s pre/after).
    // 0 = user disabled refresh entirely. Otherwise honor the override.
    intervalMs: userPrefs.refreshMs === 0 ? Infinity
              : userPrefs.refreshMs == null ? undefined
              : userPrefs.refreshMs,
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
        case 'd': setDiscoverOpen(true);  break
        case 't': setPaperOpen(true);     break
        case 'y': setReplayOpen(true);    break
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
      case 'discover':  setDiscoverOpen(true);    break
      case 'paper':     setPaperOpen(true);       break
      case 'replay':    setReplayOpen(true);      break
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

  // ── Billing routes ────────────────────────────────────────────────────────
  // No react-router in this app — do our own path-based switch. Kept as a
  // simple early-return so PricingPage / AccountBillingPage render as
  // full-page views without the ticker chrome. When Stripe redirects back
  // via /account/billing?checkout=success, useSubscription refreshes and
  // the page shows Active immediately.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  if (pathname.startsWith('/pricing')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[var(--c-bg)]" />}>
        <PricingPage />
      </Suspense>
    )
  }
  if (pathname.startsWith('/account/billing')) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[var(--c-bg)]" />}>
        <AccountBillingPage />
      </Suspense>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)] flex flex-col lg:pl-[60px] pb-16 lg:pb-9">

      {/* Sticky context rail — slides down on scroll past the MetricsBar.
          Pure presentational; renders nothing when no ticker is loaded. */}
      {hasData && (
        <StickyTickerBar
          ticker={ticker}
          quote={marketData?.quote}
          profile={marketData?.profile}
          candles={marketData?.candles}
          synthetic={marketData?.synthetic}
          onJumpToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        />
      )}

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
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={handleHome}
            className="flex items-center gap-2 sm:gap-3 shrink-0 cursor-pointer group"
            aria-label="Return to homepage"
          >
            <KairoLogo size={32} />
            <div className="flex flex-col leading-none">
              <span className="font-serif font-bold text-[var(--c-text-strong)] text-base sm:text-lg tracking-tight group-hover:text-[var(--c-text)] transition-colors">kairo</span>
              <span className="text-[8px] text-[var(--c-text-faint)] uppercase tracking-[0.25em] mt-0.5 hidden sm:inline">Know the moment.</span>
            </div>
          </button>

          <div className="ml-1 sm:ml-3 shrink-0">
            <MarketStatusPill />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto justify-end min-w-0">
            {/* Mobile palette entry — gives phones the same Cmd-K trigger desktop has in the StatusBar */}
            <button
              type="button"
              onClick={() => palette.setOpen(true)}
              aria-label="Open command palette"
              title="Search ticker or jump to section"
              className="lg:hidden flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 rounded-lg border border-[var(--c-border)] text-[var(--c-text-faint)] hover:border-[#22B585]/40 hover:text-[#22B585] transition-colors cursor-pointer shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {hasData && (
              <>
                <div className="hidden md:flex items-center gap-2 min-w-0">
                  {ticker && (
                    <span className="font-mono text-sm font-black text-[var(--c-text-strong)] tracking-[0.04em] shrink-0">
                      {ticker}
                    </span>
                  )}
                  {ticker && marketData.profile?.name && <span className="text-[var(--c-text-fainter)] shrink-0">·</span>}
                  {marketData.profile?.name && (
                    <span className="text-sm text-[var(--c-text)] font-semibold truncate max-w-[160px]">{marketData.profile.name}</span>
                  )}
                  {marketData.profile?.exchange && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--c-chip-bg)] text-[var(--c-text-faint)] uppercase tracking-widest border border-[var(--c-border-strong)] shrink-0">
                      {marketData.profile.exchange}
                    </span>
                  )}
                </div>
                <BookmarkButton
                  saved={watchlistRows.some(w => w.ticker === ticker)}
                  onToggle={() => watchlistRows.some(w => w.ticker === ticker) ? removeTicker(ticker) : addTicker(ticker)}
                />
                {/* Inline search — hidden on mobile (palette btn covers it); tablet+desktop see full form. */}
                <div className="hidden sm:block">
                  <TickerSearch onSearch={handleSearch} loading={isLoading} />
                </div>
              </>
            )}
            {isPro && <ProBadge />}
            {!isPro && user && (
              <button
                type="button"
                onClick={() => window.location.assign('/pricing')}
                title="Upgrade to Kairo Pro"
                className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-[#22B585] hover:bg-[#2BC093] text-white transition-colors cursor-pointer"
              >
                Go Pro
              </button>
            )}
            <UserMenu />
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8 flex flex-col gap-3 sm:gap-4">

        {/* Landing hero */}
        {!hasData && !isLoading && (
          <div className="relative flex flex-col items-center text-center gap-5 sm:gap-6 pt-6 sm:pt-10 pb-6 animate-fade">
            <HeroMarketBackdrop />
            {/* Ambient glow behind logo */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-[#22B585] opacity-[0.06] blur-3xl pointer-events-none" />
              <KairoLogo size={60} />
            </div>
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[var(--c-text-strong)] tracking-tight mb-2">kairo</h1>
              <p className="text-[var(--c-text-faint)] tracking-[0.3em] uppercase text-[10px] sm:text-xs">Know the moment.</p>
            </div>
            <p className="text-[var(--c-text-faint)] text-[13px] sm:text-sm max-w-xs sm:max-w-sm leading-relaxed px-4 sm:px-0">
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
              synthetic={marketData.synthetic}
              fundamentalsData={fundamentalsData}
            />

            {/* Two-column on desktop: left = chart/indicators, right = AI */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">

              {/* Left column — "the data": chart, technicals, fundamentals,
                  and the user-set price levels they're watching. */}
              <div className="flex flex-col gap-3 sm:gap-4">
                <ErrorBoundary>
                  <CandleChart candles={marketData.candles} synthetic={marketData.synthetic} />
                </ErrorBoundary>
                <IndicatorsGrid
                  candles={marketData.candles}
                  loading={false}
                  asOf={marketData.fetchedAt}
                  synthetic={marketData.synthetic}
                  syntheticReason={marketData.syntheticReason}
                  currentPrice={marketData.quote?.c}
                />
                <CandlePatterns data={aiData?.patterns} loading={loading.ai} />
                <SupportResistance
                  candles={marketData.candles}
                  currentPrice={marketData.quote?.c}
                  asOf={marketData.fetchedAt}
                />
                {/* Future-facing pair — analyst targets + next earnings.
                    Both compact; share a row at sm+ so they don't each
                    occupy a full-width slot. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <PriceTargets
                    data={fundamentalsData?.targets}
                    currentPrice={marketData.quote?.c}
                    loading={loading.ai}
                  />
                  <EarningsCalendar data={fundamentalsData?.earnings} loading={loading.ai} />
                </div>
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

              {/* Right column — "Kairo + You": the AI's read on the ticker
                  and how it lands against the user's actual position. */}
              <div className="flex flex-col gap-3 sm:gap-4">
                {previousVerdict && aiData && (
                  <VerdictMemory
                    previous={previousVerdict}
                    current={aiData}
                    currentPrice={marketData.quote?.c}
                  />
                )}
                {/* Free users can reveal ONE AI Recommendation per day.
                    After that, the panel renders inside an UpgradeOverlay. */}
                {isPro || quota.canRevealVerdict ? (
                  <Recommendation
                    data={aiData}
                    loading={loading.ai}
                    error={aiError}
                    asOf={aiData?.fetchedAt}
                    ticker={ticker}
                    onCompare={(tickers) => { setCompareSeed(tickers); setCompareOpen(true) }}
                  />
                ) : (
                  <UpgradeOverlay
                    title="More AI Recommendations"
                    subtitle={`You've used your ${quota.limits.verdict} free verdict today. Upgrade for unlimited BUY/SELL/HOLD calls with entry + stop reasoning.`}
                  >
                    <Recommendation
                      data={aiData}
                      loading={loading.ai}
                      error={aiError}
                      asOf={aiData?.fetchedAt}
                      ticker={ticker}
                      onCompare={(tickers) => { setCompareSeed(tickers); setCompareOpen(true) }}
                    />
                  </UpgradeOverlay>
                )}
                {/* AI Analysis is Pro-gated. Free users see the panel
                    blurred with an upgrade CTA on top. */}
                {isPro ? (
                  <AIAnalysis
                    data={analysisData}
                    loading={loading.ai}
                    error={analysisError}
                    asOf={analysisData?.fetchedAt}
                    verdict={aiData?.verdict}
                    confidence={aiData?.confidence}
                  />
                ) : (
                  <UpgradeOverlay
                    title="AI Analysis — full technical workup"
                    subtitle="Get the per-indicator breakdown, agreement/contradiction confluence, and range + fundamentals context. Pro only."
                  >
                    <AIAnalysis
                      data={analysisData}
                      loading={loading.ai}
                      error={analysisError}
                      asOf={analysisData?.fetchedAt}
                      verdict={aiData?.verdict}
                      confidence={aiData?.confidence}
                    />
                  </UpgradeOverlay>
                )}
                {ticker && (
                  <MyPosition
                    ticker={ticker}
                    aiData={aiData}
                    currentPrice={marketData.quote?.c}
                    userId={user?.id}
                  />
                )}
                {aiData && <AIChat ticker={ticker} context={aiData} />}
              </div>
            </div>

            {/* Bottom shelf — was four stacked full-width cards (~2000px
                of vertical scroll); now a tabbed surface so the user can
                browse in place. Only the active tab mounts (saves render
                cost on the heavier options/covered-calls tabs). */}
            <div id="section-news" className="w-full flex flex-col gap-3 animate-enter">
              <div className="flex items-center gap-1 border-b border-[var(--c-border)] overflow-x-auto">
                {[
                  { id: 'news',          label: 'News'          },
                  { id: 'insider',       label: 'Insider'       },
                  { id: 'options',       label: 'Options'       },
                  { id: 'covered-calls', label: 'Covered Calls' },
                ].map(t => {
                  const active = bottomTab === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBottomTab(t.id)}
                      className={`relative px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors shrink-0 cursor-pointer ${
                        active
                          ? 'text-[#22B585]'
                          : 'text-[var(--c-text-faint)] hover:text-[var(--c-text)]'
                      }`}
                    >
                      {t.label}
                      {/* Solid 3px green indicator with rounded top edges —
                          replaces the thin border-b-2 so the active tab
                          reads as a real underline, not a border artifact. */}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute left-2 right-2 -bottom-px h-[3px] bg-[#22B585] rounded-t-full"
                        />
                      )}
                    </button>
                  )
                })}
              </div>
              <div>
                {/* News stays free — the other three tabs are Pro-gated. */}
                {bottomTab === 'news' && <NewsFeed data={marketData.news} loading={loading.ai} asOf={marketData.fetchedAt} />}
                {bottomTab === 'insider' && (
                  isPro
                    ? <InsiderTrades data={fundamentalsData?.insider} loading={loading.ai && !fundamentalsData} ticker={ticker} />
                    : <UpgradeOverlay
                        title="Insider transactions + sentiment"
                        subtitle="See every Form 4 filing for the ticker, plus a 90-day net-buy vs net-sell dollar sentiment. Pro only."
                      >
                        <InsiderTrades data={fundamentalsData?.insider} loading={loading.ai && !fundamentalsData} ticker={ticker} />
                      </UpgradeOverlay>
                )}
                {bottomTab === 'options' && (
                  isPro
                    ? <OptionsScanner ticker={ticker} currentPrice={marketData.quote?.c} />
                    : <UpgradeOverlay
                        title="Options chain — calls + puts"
                        subtitle="Live strikes, expiries, open interest, and IV for every ticker. Unusual-activity flags included. Pro only."
                      >
                        <OptionsScanner ticker={ticker} currentPrice={marketData.quote?.c} />
                      </UpgradeOverlay>
                )}
                {bottomTab === 'covered-calls' && (
                  isPro
                    ? <CoveredCallScanner ticker={ticker} currentPrice={marketData.quote?.c} candles={marketData.candles} profile={marketData.profile} />
                    : <UpgradeOverlay
                        title="Covered Call scanner"
                        subtitle="Model your shares + cost basis against real strikes, breakevens, and resistance levels. Pro only."
                      >
                        <CoveredCallScanner ticker={ticker} currentPrice={marketData.quote?.c} candles={marketData.candles} profile={marketData.profile} />
                      </UpgradeOverlay>
                )}
              </div>
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
      {discoverOpen && (
        <Suspense fallback={null}>
          <DiscoverView
            open
            onClose={() => setDiscoverOpen(false)}
            onSelectTicker={handleSearch}
          />
        </Suspense>
      )}
      {paperOpen && (
        <Suspense fallback={null}>
          <PaperPitView
            open
            onClose={() => setPaperOpen(false)}
            userId={user?.id}
            currentTicker={ticker}
            currentPrice={marketData?.quote?.c}
            aiData={aiData}
            onSelectTicker={handleSearch}
          />
        </Suspense>
      )}
      {replayOpen && (
        <Suspense fallback={null}>
          <ReplayView
            open
            onClose={() => setReplayOpen(false)}
            userId={user?.id}
            ticker={ticker}
          />
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
