import { useState, useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'

function calcBollingerBands(candles, period = 20) {
  const bands = []
  for (let i = period - 1; i < candles.length; i++) {
    const closes = candles.slice(i - period + 1, i + 1).map(c => c.close)
    const mean = closes.reduce((a, b) => a + b, 0) / period
    const std = Math.sqrt(closes.reduce((s, c) => s + (c - mean) ** 2, 0) / period)
    bands.push({
      time: candles[i].time,
      upper: +(mean + 2 * std).toFixed(4),
      middle: +mean.toFixed(4),
      lower: +(mean - 2 * std).toFixed(4),
    })
  }
  return bands
}

export default function CandleChart({ candles, synthetic }) {
  const containerRef = useRef(null)
  const bandsRef = useRef(null)
  const [showBands, setShowBands] = useState(false)

  // Recreate chart whenever candles change (new ticker)
  useEffect(() => {
    if (!containerRef.current || !candles?.length) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6b7280',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1d27' },
        horzLines: { color: '#1a1d27' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#2e3347',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: '#2e3347',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: true,
      handleScale: true,
      width: containerRef.current.clientWidth,
      height: 380,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#1D9E75',
      downColor: '#e55353',
      borderVisible: false,
      wickUpColor: '#1D9E75',
      wickDownColor: '#e55353',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    // Bollinger band series — hidden until toggle
    const lineOpts = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineWidth: 1 }
    const upperBand  = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(29,158,117,0.45)', visible: showBands })
    const middleBand = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(255,255,255,0.18)', visible: showBands })
    const lowerBand  = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(29,158,117,0.45)', visible: showBands })
    bandsRef.current = { upper: upperBand, middle: middleBand, lower: lowerBand }

    // Set candle + volume data
    candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    volumeSeries.setData(candles.map(({ time, open, close, volume }) => ({
      time, value: volume ?? 0,
      color: close >= open ? '#1D9E7540' : '#e5535340',
    })))

    // Set band data (only possible when candles >= period)
    const bands = calcBollingerBands(candles)
    upperBand.setData(bands.map(b => ({ time: b.time, value: b.upper })))
    middleBand.setData(bands.map(b => ({ time: b.time, value: b.middle })))
    lowerBand.setData(bands.map(b => ({ time: b.time, value: b.lower })))

    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
      bandsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles])

  // Toggle band visibility without recreating the chart
  useEffect(() => {
    if (!bandsRef.current) return
    const opts = { visible: showBands }
    bandsRef.current.upper?.applyOptions(opts)
    bandsRef.current.middle?.applyOptions(opts)
    bandsRef.current.lower?.applyOptions(opts)
  }, [showBands])

  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Price · 30D · Daily</span>
        <div className="flex items-center gap-2 flex-wrap">
          {synthetic && (
            <span className="text-[10px] text-yellow-600 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded">
              Simulated history
            </span>
          )}
          <button
            onClick={() => setShowBands(v => !v)}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
              showBands
                ? 'bg-[#1D9E75]/15 text-[#1D9E75] border-[#1D9E75]/40'
                : 'bg-[#1a2820] text-gray-500 border-[#2e3347] hover:text-gray-300'
            }`}
          >
            BB {showBands ? 'ON' : 'OFF'}
          </button>
          <span className="text-xs text-gray-600">TradingView</span>
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  )
}
