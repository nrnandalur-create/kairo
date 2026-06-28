import { useState, useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'
import { usePrefs } from '../hooks/usePrefs'

// Pull a computed CSS var off <html>. Used so the chart matches whatever
// theme is active and re-themes when the user flips Settings → Light/Dark.
function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

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
  const { theme } = usePrefs()

  useEffect(() => {
    if (!containerRef.current || !candles?.length) return

    const tfDays   = TIMEFRAMES.find(t => t.label === tf)?.days ?? Infinity
    const filtered = tfDays === Infinity ? candles : candles.slice(-tfDays)

    // Sample current theme tokens so the chart matches the rest of the UI.
    const textColor   = cssVar('--c-text-faint',     '#4b6358')
    const gridColor   = cssVar('--c-card',           '#0f1611')
    const borderColor = cssVar('--c-border',         '#1a2e1f')
    const middleBand  = theme === 'light' ? 'rgba(20,30,25,0.18)' : 'rgba(255,255,255,0.12)'

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor,
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
      upColor:      '#22B585',
      downColor:    '#ef5454',
      borderVisible: false,
      wickUpColor:  '#22B585',
      wickDownColor:'#ef5454',
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
    const upperBand    = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(34,181,133,0.55)',  visible: showBands })
    const middleBandS  = chart.addSeries(LineSeries, { ...lineOpts, color: middleBand, visible: showBands, lineStyle: 2 })
    const lowerBand    = chart.addSeries(LineSeries, { ...lineOpts, color: 'rgba(34,181,133,0.55)',  visible: showBands })
    bandsRef.current = { upper: upperBand, middle: middleBandS, lower: lowerBand }

    candleSeries.setData(filtered.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })))
    volumeSeries.setData(filtered.map(({ time, open, close, volume }) => ({
      time, value: volume ?? 0,
      color: close >= open ? 'rgba(34,181,133,0.25)' : 'rgba(239,84,84,0.25)',
    })))

    const bands = calcBollingerBands(filtered)
    upperBand.setData(bands.map(b => ({ time: b.time, value: b.upper })))
    middleBandS.setData(bands.map(b => ({ time: b.time, value: b.middle })))
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
  }, [candles, tf, theme])

  useEffect(() => {
    if (!bandsRef.current) return
    const opts = { visible: showBands }
    bandsRef.current.upper?.applyOptions(opts)
    bandsRef.current.middle?.applyOptions(opts)
    bandsRef.current.lower?.applyOptions(opts)
  }, [showBands])

  return (
    <div className="w-full glass-card rounded-2xl overflow-hidden animate-enter">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">Price Chart</span>
          {synthetic && (
            <span
              title="Real OHLC data is unavailable for this ticker right now. The bars below are a stand-in for visual context only — do not trade off them."
              className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#e3a234] border border-[#e3a234]/40 bg-[#e3a234]/10 px-2 py-0.5 rounded-full"
            >
              <span aria-hidden="true">⚠</span> Simulated data
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe buttons */}
          <div className="flex items-center gap-1 bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg p-0.5">
            {TIMEFRAMES.map(({ label }) => (
              <button
                key={label}
                onClick={() => setTf(label)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-all duration-150 cursor-pointer active:scale-[0.94] ${
                  tf === label
                    ? 'bg-[#22B585] text-white shadow-[0_0_8px_rgba(29,158,117,0.3)]'
                    : 'text-[var(--c-text-faint)] hover:text-[var(--c-text)] hover:bg-[var(--c-card)]'
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
                ? 'bg-[#22B585] text-white border-[#22B585] shadow-[0_0_8px_rgba(29,158,117,0.25)]'
                : 'bg-[var(--c-input-bg)] text-[var(--c-text-faint)] border-[var(--c-border)] hover:border-[#22B585]/50 hover:text-[#22B585]'
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
