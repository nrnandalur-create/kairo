import { useState } from 'react'
import TickerSearch from './components/TickerSearch'
import MetricsBar from './components/MetricsBar'
import AIAnalysis from './components/AIAnalysis'
import CandlePatterns from './components/CandlePatterns'
import OptionsScanner from './components/OptionsScanner'
import NewsFeed from './components/NewsFeed'
import { getMockData } from './mockData'

export default function App() {
  const [ticker, setTicker] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSearch = (t) => {
    setLoading(true)
    setTicker(t)
    setTimeout(() => {
      setData(getMockData(t))
      setLoading(false)
    }, 800)
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-gray-100">
      {/* Header */}
      <header className="border-b border-[#2e3347] bg-[#0f1117]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1D9E75] flex items-center justify-center">
              <span className="text-white font-black text-sm">K</span>
            </div>
            <div>
              <span className="font-bold text-white tracking-tight text-lg">Kairo</span>
              <span className="ml-2 text-xs text-gray-500 hidden sm:inline">Know the moment.</span>
            </div>
          </div>
          <span className="text-xs text-gray-600 hidden md:block">Powered by AI · Demo mode</span>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
        {/* Hero / Search */}
        {!data && !loading && (
          <div className="flex flex-col items-center text-center gap-6 py-16">
            <div className="w-16 h-16 rounded-2xl bg-[#1D9E75]/15 border border-[#1D9E75]/30 flex items-center justify-center">
              <span className="text-[#1D9E75] font-black text-2xl">K</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white tracking-tight mb-2">Kairo</h1>
              <p className="text-gray-500 text-lg">Know the moment.</p>
            </div>
            <p className="text-gray-400 text-sm max-w-md">
              Enter any ticker to get AI-powered analysis, candle patterns, options flow, and sentiment — all in one place.
            </p>
            <TickerSearch onSearch={handleSearch} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-24">
            <div className="w-8 h-8 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
            <p className="text-sm text-gray-500">Analyzing {ticker}…</p>
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <>
            {/* Inline search bar */}
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <span className="text-2xl font-bold text-white">{ticker}</span>
                <span className="ml-2 text-xs text-gray-500 uppercase tracking-wider">· Live Analysis</span>
              </div>
              <TickerSearch onSearch={handleSearch} />
            </div>

            <MetricsBar data={data.metrics} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AIAnalysis data={data.analysis} />
              <CandlePatterns data={data.patterns} />
            </div>

            <OptionsScanner data={data.options} />
            <NewsFeed data={data.news} />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2e3347] mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-gray-600 text-center">
          Kairo is for informational purposes only. Not financial advice. · Demo data only.
        </div>
      </footer>
    </div>
  )
}
