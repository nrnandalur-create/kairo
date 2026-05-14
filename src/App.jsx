import { useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import KairoLogo from './components/KairoLogo'
import TickerSearch from './components/TickerSearch'
import MetricsBar from './components/MetricsBar'
import CandleChart from './components/CandleChart'
import AIAnalysis from './components/AIAnalysis'
import CandlePatterns from './components/CandlePatterns'
import OptionsScanner from './components/OptionsScanner'
import NewsFeed from './components/NewsFeed'
import { fetchMarket } from './services/finnhub'
import { getMockOptions, getMockNews } from './mockData'

const LOADING_NONE = { market: false, ai: false }
const LOADING_MARKET = { market: true, ai: false }
const LOADING_AI = { market: false, ai: true }

export default function App() {
  const [ticker, setTicker] = useState(null)
  const [loading, setLoading] = useState(LOADING_NONE)
  const [marketData, setMarketData] = useState(null)
  const [aiData, setAiData] = useState(null)
  const [error, setError] = useState(null)

  const isLoading = loading.market || loading.ai

  const handleSearch = async (sym) => {
    setTicker(sym)
    setError(null)
    setAiData(null)
    setMarketData(null)
    setLoading(LOADING_MARKET)

    try {
      const { quote, profile, metrics, candles, synthetic } = await fetchMarket(sym)

      if (!quote || quote.c == null) {
        setError(`No data found for "${sym}". Check the ticker symbol and try again.`)
        setLoading(LOADING_NONE)
        return
      }

      setMarketData({ quote, profile, metrics, candles, synthetic })
      setLoading(LOADING_AI)

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: sym, quote, profile, metrics, candles }),
        })
        if (res.ok) {
          const analysis = await res.json()
          setAiData(analysis)
        }
        // Silently skip AI if endpoint is unavailable (local dev without vercel dev)
      } catch {
        // AI analysis unavailable in this environment
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
    <div className="min-h-screen bg-[#0a0f0d] text-gray-100 flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-[#1e2d28] bg-[#0a0f0d]/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <KairoLogo size={36} />
            <div className="flex flex-col leading-none">
              <span className="font-serif font-bold text-white text-xl tracking-tight">kairo</span>
              <span className="text-[9px] text-gray-500 uppercase tracking-[0.2em] mt-0.5">Know the moment.</span>
            </div>
          </div>

          {hasData && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm font-bold text-gray-300">{ticker}</span>
              <TickerSearch onSearch={handleSearch} loading={isLoading} />
            </div>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">
        {/* Landing hero */}
        {!hasData && !isLoading && (
          <div className="flex flex-col items-center text-center gap-8 py-20">
            <KairoLogo size={72} />
            <div>
              <h1 className="font-serif text-5xl sm:text-6xl font-bold text-white tracking-tight mb-3">kairo</h1>
              <p className="text-gray-400 tracking-[0.3em] uppercase text-xs">Know the moment.</p>
            </div>
            <p className="text-gray-500 text-sm max-w-md leading-relaxed">
              Real-time price data, interactive candlestick charts, and Claude-powered AI analysis — all from a single ticker.
            </p>
            <TickerSearch onSearch={handleSearch} loading={isLoading} />
            <div className="flex gap-6 text-xs text-gray-700 flex-wrap justify-center">
              <span>Finnhub market data</span>
              <span>·</span>
              <span>TradingView charts</span>
              <span>·</span>
              <span>Claude AI analysis</span>
            </div>
          </div>
        )}

        {/* Loading state — market data */}
        {loading.market && (
          <div className="flex flex-col items-center gap-4 py-32">
            <div className="w-8 h-8 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
            <p className="text-sm text-gray-500">Fetching market data for <span className="text-[#1D9E75] font-semibold">{ticker}</span>…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-[#e55353]/10 border border-[#e55353]/25 rounded-2xl p-5 text-sm text-[#e55353] flex items-start gap-3">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {hasData && !loading.market && (
          <ErrorBoundary>
            <MetricsBar quote={marketData.quote} profile={marketData.profile} metrics={marketData.metrics} />
            <ErrorBoundary>
              <CandleChart candles={marketData.candles} synthetic={marketData.synthetic} />
            </ErrorBoundary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <AIAnalysis data={aiData} loading={loading.ai} />
              <CandlePatterns data={aiData?.patterns} loading={loading.ai} />
            </div>
            <OptionsScanner data={getMockOptions(ticker)} />
            <NewsFeed data={getMockNews(ticker)} />
          </ErrorBoundary>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#1e2d28] mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-4 text-[10px] text-gray-700 text-center">
          Kairo is for informational purposes only and does not constitute financial advice. Market data via Finnhub. AI analysis via Anthropic Claude.
        </div>
      </footer>
    </div>
  )
}
