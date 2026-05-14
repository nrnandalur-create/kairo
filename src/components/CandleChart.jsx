import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'

export default function CandleChart({ candles, synthetic }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

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
    chartRef.current = chart

    // v5 API: chart.addSeries(SeriesType, options)
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
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    const candleData = candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    const volumeData = candles.map(({ time, open, close, volume }) => ({
      time,
      value: volume ?? 0,
      color: close >= open ? '#1D9E7540' : '#e5535340',
    }))

    candleSeries.setData(candleData)
    volumeSeries.setData(volumeData)
    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [candles])

  return (
    <div className="w-full bg-[#0d1210] border border-[#1e2d28] rounded-2xl overflow-hidden">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Price · 30D · Daily</span>
        <div className="flex items-center gap-2">
          {synthetic && (
            <span className="text-[10px] text-yellow-600 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded">
              Simulated history · upgrade API for real candles
            </span>
          )}
          <span className="text-xs text-gray-600">Powered by TradingView</span>
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  )
}
