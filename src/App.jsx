import { useState } from 'react'
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
import NewsFeed from './components/NewsFeed'
import MarketPulse from './components/MarketPulse'
import Watchlist from './components/Watchlist'
import Screener from './components/Screener'
import Portfolio from './components/Portfolio'
import PriceAlertForm from './components/PriceAlertForm'
import { useWatchlist } from './hooks/useWatchlist'
import { useAlerts } from './hooks/useAlerts'
import { fetchMarket } from './services/finnhub'
import { fetchAnalysis } from './services/analyze'
import { getMockOptions, getMockNews } from './mockData'

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
  const [error, setError]       = useState(null)
  const watchlist      = useWatchlist()
  const alerts         = useAlerts()
  const [screenerOpen,  setScreenerOpen]  = useState(false)
  const [portfolioOpen, setPortfolioOpen] = useState(false)

  const isLoading = loading.market || loading.ai

  const handleSearch = async (sym) => {
    setTicker(sym)
    setError(null)
    setAiData(null)
    setMarketData(null)
    setLoading(LOADING_MARKET)

    try {
      const { quote, profile, metrics, candles, synthetic, news } = await fetchMarket(sym)

      if (!quote || quote.c == null) {
        setError(`No data found for "${sym}". Check the ticker symbol and try again.`)
        setLoading(LOADING_NONE)
        return
      }

      setMarketData({ quote, profile, metrics, candles, synthetic, news })
      setLoading(LOADING_AI)

      try {
        const analysis = await fetchAnalysis({ ticker: sym, quote, profile, metrics, candles })
        setAiData(analysis)
      } catch {
        // AI analysis unavailable — page continues without it
      }

      setLoading(LOADING_NONE)
    } catch (err) {
      setError(
        err.message.includes('401') || err.message.includes('403')
          ? 'Invalid Finnhub API key. Check your FINNHUB_API_KEY in Vercel environment variables.'
          : 'Failed to fetch market data. Check your API key or try again.'
      )
      setLoading(LOADING_NONE)
    }
  }

  const hasData = !!marketData

  return (
    <div className="min-h-screen bg-[#080c0a] text-[#d1d9d5] flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-[#1a2e1f] bg-[#080c0a]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <KairoLogo size={32} />
            <div className="flex flex-col leading-none">
              <span className="font-serif font-bold text-white text-lg tracking-tight">kairo</span>
              <span className="text-[8px] text-[#4b6358] uppercase tracking-[0.25em] mt-0.5">Know the moment.</span>
            </div>
          </div>

          {hasData && (
            <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">
              <div className="flex items-center gap-2 hidden sm:flex">
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
                saved={watchlist.has(ticker)}
                onToggle={() => watchlist.has(ticker) ? watchlist.remove(ticker) : watchlist.add(ticker)}
              />
              <TickerSearch onSearch={handleSearch} loading={isLoading} />
            </div>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">

        {/* Landing hero */}
        {!hasData && !isLoading && (
          <div className="flex flex-col items-center text-center gap-6 pt-10 pb-6 animate-fade">
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
          </div>
        )}

        {/* Screener + Portfolio buttons — visible on landing only */}
        {!hasData && !isLoading && (
          <div className="flex gap-2">
            <button
              onClick={() => setScreenerOpen(true)}
              className="flex items-center gap-2 bg-[#0f1611] border border-[#1a2e1f] hover:border-[#263d2c] hover:bg-[#0c1410] text-[#4b6358] hover:text-[#d1d9d5] text-xs font-semibold px-4 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="1" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="7.5" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="1" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              Screener
            </button>
            <button
              onClick={() => setPortfolioOpen(true)}
              className="flex items-center gap-2 bg-[#0f1611] border border-[#1a2e1f] hover:border-[#263d2c] hover:bg-[#0c1410] text-[#4b6358] hover:text-[#d1d9d5] text-xs font-semibold px-4 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6.5 3.5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Portfolio
            </button>
          </div>
        )}

        {/* Watchlist — visible on landing only, above market pulse */}
        {!hasData && !isLoading && (
          <Watchlist
            tickers={watchlist.tickers}
            onSelect={handleSearch}
            onRemove={watchlist.remove}
            getAlert={alerts.getAlert}
          />
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
              quote={marketData.quote}
              profile={marketData.profile}
              metrics={marketData.metrics}
            />

            {/* Two-column on desktop: left = chart/indicators, right = AI */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

              {/* Left column — chart & technical */}
              <div className="flex flex-col gap-5">
                <ErrorBoundary>
                  <CandleChart candles={marketData.candles} synthetic={marketData.synthetic} />
                </ErrorBoundary>
                <IndicatorsGrid candles={marketData.candles} loading={false} />
                <SupportResistance
                  candles={marketData.candles}
                  currentPrice={marketData.quote?.c}
                />
              </div>

              {/* Right column — AI recommendation & analysis */}
              <div className="flex flex-col gap-5">
                <Recommendation data={aiData} loading={loading.ai} />
                <AIAnalysis data={aiData} loading={loading.ai} />
                <CandlePatterns data={aiData?.patterns} loading={loading.ai} />
                <PriceAlertForm
                  ticker={ticker}
                  currentPrice={marketData.quote?.c}
                  getAlert={alerts.getAlert}
                  setAlert={alerts.setAlert}
                  clearAlert={alerts.clearAlert}
                />
              </div>
            </div>

            {/* Full width — Options scanner */}
            <OptionsScanner data={getMockOptions(ticker, marketData.quote?.c)} />

            {/* Full width — News feed */}
            <NewsFeed data={marketData.news} />
          </ErrorBoundary>
        )}
      </main>

      {/* ── Modals ── */}
      <Screener
        open={screenerOpen}
        onClose={() => setScreenerOpen(false)}
        onAnalyze={handleSearch}
      />
      <Portfolio
        open={portfolioOpen}
        onClose={() => setPortfolioOpen(false)}
        onAnalyze={handleSearch}
      />

      {/* ── Footer ── */}
      <footer className="border-t border-[#1a2e1f] mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-[10px] text-[#263d2c] text-center">
          Kairo is for informational purposes only and does not constitute financial advice.
          Market data via Finnhub · Alpha Vantage. AI analysis via Groq.
        </div>
      </footer>
    </div>
  )
}
