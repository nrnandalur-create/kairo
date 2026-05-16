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
import { fetchMarket } from './services/finnhub'
import { fetchAnalysis } from './services/analyze'
import { getMockOptions, getMockNews } from './mockData'

const LOADING_NONE   = { market: false, ai: false }
const LOADING_MARKET = { market: true,  ai: false }
const LOADING_AI     = { market: false, ai: true  }

export default function App() {
  const [ticker, setTicker]     = useState(null)
  const [loading, setLoading]   = useState(LOADING_NONE)
  const [marketData, setMarketData] = useState(null)
  const [aiData, setAiData]     = useState(null)
  const [error, setError]       = useState(null)

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
      } catch (aiErr) {
        console.warn('[app] AI analysis unavailable:', aiErr.message)
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
              <TickerSearch onSearch={handleSearch} loading={isLoading} />
            </div>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">

        {/* Landing hero */}
        {!hasData && !isLoading && (
          <div className="flex flex-col items-center text-center gap-8 py-20 animate-fade">
            {/* Ambient glow behind logo */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-48 h-48 rounded-full bg-[#1D9E75] opacity-[0.06] blur-3xl pointer-events-none" />
              <KairoLogo size={76} />
            </div>
            <div>
              <h1 className="font-serif text-5xl sm:text-6xl font-bold text-white tracking-tight mb-3">kairo</h1>
              <p className="text-[#4b6358] tracking-[0.3em] uppercase text-xs">Know the moment.</p>
            </div>
            <p className="text-[#4b6358] text-sm max-w-sm leading-relaxed">
              Real-time market data, interactive charts, technical indicators, and AI-powered analysis — all from a single ticker.
            </p>
            <TickerSearch onSearch={handleSearch} loading={isLoading} />
            <div className="flex gap-5 text-[11px] text-[#263d2c] flex-wrap justify-center">
              <span>Finnhub</span>
              <span>·</span>
              <span>Alpha Vantage</span>
              <span>·</span>
              <span>Groq AI</span>
            </div>
          </div>
        )}

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
              </div>
            </div>

            {/* Full width — Options scanner */}
            <OptionsScanner data={getMockOptions(ticker, marketData.quote?.c)} />

            {/* Full width — News feed */}
            <NewsFeed data={marketData.news} />
          </ErrorBoundary>
        )}
      </main>

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
