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
      time:   candles[i].time,
      upper:  +(mean + 2 * std).toFixed(4),
      middle: +mean.toFixed(4),
      lower:  +(mean - 2 * std).toFixed(4),
    })
  }
  return bands
}

const TIMEFRAMES = [
  { label: '1W',  days: 7 },
  { label: '1M',  days: 22 },
  { label: '3M',  days: 65 },
  { label: 'MAX', days: Infinity },
]

export default function CandleChart({ candles, synthetic }) {
  const containerRef = useRef(null)
  const bandsRef     = useRef(null)
  const [showBands, setShowBands] = useState(true)
  const [tf, setTf] = useState('1M')

  useEffect(() => {
    if (!containerRef.current || !candles?.length) return

    const tfDays   = TIMEFRAMES.find(t => t.label === tf)?.days ?? Infinity
    const filtered = tfDays === Infinity ? candles : candles.slice(-tfDays)

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#4b6358',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#0f1611' },
        horzLines: { color: '#131f17' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#1a2e1f',
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: '#1a2e1f',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: true,
      handleScale: true,
      width: containerRef.current.clientWidth,
      height: 420,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:      '#1D9E75',
      downColor:    '#e24b4a',
      borderVisible: false,
      wickUpColor:  '#1D9E75',
      wickDownColor:'#e24b4a',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })

    const lineOpts = {
      priceLineVisible:       false,
      lastValueVisible:       false,
      crosshairMarkerVisible: false,
      lineWidth: 1,
    }
    const upperBand  = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(29,158,117,0.5)',  visible: showBands })
    const middleBand = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(255,255,255,0.12)', visible: showBands, lineStyle: 2 })
    const lowerBand  = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(29,158,117,0.5)',  visible: showBands })
    bandsRef.current = { upper: upperBand, middle: middleBand, lower: lowerBand }

    candleSeries.setData(filtered.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    volumeSeries.setData(filtered.map(({ time, open, close, volume }) => ({
      time, value: volume ?? 0,
      color: close >= open ? 'rgba(29,158,117,0.2)' : 'rgba(226,75,74,0.2)',
    })))

    const bands = calcBollingerBands(filtered)
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
  }, [candles, tf])

  useEffect(() => {
    if (!bandsRef.current) return
    const opts = { visible: showBands }
    bandsRef.current.upper?.applyOptions(opts)
    bandsRef.current.middle?.applyOptions(opts)
    bandsRef.current.lower?.applyOptions(opts)
  }, [showBands])

  return (
    <div className="w-full bg-[#0f1611] border border-[#1a2e1f] rounded-2xl overflow-hidden animate-enter">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#4b6358] uppercase tracking-[0.12em]">Price Chart</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe buttons */}
          <div className="flex items-center gap-1 bg-[#0a0f0d] border border-[#1a2e1f] rounded-lg p-0.5">
            {TIMEFRAMES.map(({ label }) => (
              <button
                key={label}
                onClick={() => setTf(label)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all duration-150 cursor-pointer active:scale-[0.94] ${
                  tf === label
                    ? 'bg-[#1D9E75] text-white shadow-[0_0_8px_rgba(29,158,117,0.3)]'
                    : 'text-[#4b6358] hover:text-[#d1d9d5] hover:bg-[#0f1611]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* BB toggle */}
          <button
            onClick={() => setShowBands(v => !v)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer active:scale-[0.94] ${
              showBands
                ? 'bg-[#1D9E75] text-white border-[#1D9E75] shadow-[0_0_8px_rgba(29,158,117,0.25)]'
                : 'bg-[#0a0f0d] text-[#4b6358] border-[#1a2e1f] hover:border-[#1D9E75]/50 hover:text-[#1D9E75]'
            }`}
          >
            BB
          </button>
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  )
}
