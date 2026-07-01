import { useState, useEffect } from 'react'

const STRIKES = [
  { pct: 0.10, premiumPct: 0.028, label: '+10%' },
  { pct: 0.15, premiumPct: 0.022, label: '+15%' },
  { pct: 0.20, premiumPct: 0.016, label: '+20%', suggested: true },
  { pct: 0.25, premiumPct: 0.011, label: '+25%' },
]

// Heuristic to flag ETFs / index products so we can render the cash-settled,
// European-style disclaimer. Not perfect — American-style ETF options exist —
// but SPY, QQQ, IWM, DIA (which are American, physically-settled) live outside
// this list, so the false-positive rate is low.
const ETF_NAME_RE = /(ETF|ETN|Trust|Fund|Index|SPDR|iShares|Vanguard|Invesco|Direxion|ProShares)/i
// Broad-based indices that are cash-settled, European-style options (XSP, SPX,
// NDX, RUT). Not exhaustive but covers the ones users are most likely to look up.
const EU_SETTLED = new Set(['XSP', 'SPX', 'SPXW', 'NDX', 'RUT', 'VIX'])

function isEuStyleTicker(ticker, profileName) {
  if (!ticker) return false
  if (EU_SETTLED.has(ticker.toUpperCase())) return true
  return false
}

function isEtfLike(ticker, profileName) {
  if (!profileName) return false
  return ETF_NAME_RE.test(profileName)
}

function getNextFridays(n = 4) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = today.getDay()
  const daysToFirst = day <= 4 ? 5 - day : 12 - day
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + daysToFirst + i * 7)
    return d
  })
}

function fmtExpiry(s) {
  if (!s) return '—'
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtExpiryFromDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtMoney(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 10_000) return `$${(n / 1_000).toFixed(0)}k`
  if (abs >=  1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function fmtPrice(n) {
  if (!Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(1)}%`
}

// Simple swing-high resistance level: highest daily close in the last 60 bars,
// excluding today's session. Matches what most traders eyeball as "the last
// price ceiling the stock respected."
function computeResistance(candles) {
  if (!candles || candles.length < 10) return null
  const window = candles.slice(-60, -1)
  if (!window.length) return null
  let hi = 0
  for (const c of window) if (c.high > hi) hi = c.high
  return hi > 0 ? hi : null
}

// Persist per-ticker share count + cost basis so the panel is meaningful
// as soon as the user returns. Keyed by ticker so each holding stands
// alone in localStorage.
function loadPosition(ticker) {
  if (!ticker) return { shares: 200, costBasis: null }
  try {
    const raw = localStorage.getItem(`kairo_cc_position_${ticker}`)
    if (!raw) return { shares: 200, costBasis: null }
    const parsed = JSON.parse(raw)
    return {
      shares:    Number.isFinite(+parsed.shares) && +parsed.shares > 0 ? +parsed.shares : 200,
      costBasis: Number.isFinite(+parsed.costBasis) && +parsed.costBasis > 0 ? +parsed.costBasis : null,
    }
  } catch {
    return { shares: 200, costBasis: null }
  }
}

function savePosition(ticker, pos) {
  if (!ticker) return
  try {
    localStorage.setItem(`kairo_cc_position_${ticker}`, JSON.stringify(pos))
  } catch {}
}

export default function CoveredCallScanner({ ticker, currentPrice, candles, profile }) {
  const [liveContracts, setLiveContracts] = useState(null)
  const [fetchingLive,  setFetchingLive]  = useState(false)
  const [position,      setPosition]      = useState(() => loadPosition(ticker))

  // Hydrate the per-ticker position whenever the ticker changes.
  useEffect(() => {
    setPosition(loadPosition(ticker))
  }, [ticker])

  // Persist edits back into localStorage as the user types.
  useEffect(() => {
    savePosition(ticker, position)
  }, [ticker, position])

  useEffect(() => {
    if (!ticker || !currentPrice) return
    const controller = new AbortController()
    setLiveContracts(null)
    setFetchingLive(true)
    fetch(`/api/options?symbol=${encodeURIComponent(ticker)}&price=${currentPrice}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.contracts?.length) setLiveContracts(d.contracts)
      })
      .catch(err => { if (err?.name !== 'AbortError') { /* keep null → estimates */ } })
      .finally(() => setFetchingLive(false))
    return () => controller.abort()
  }, [ticker, currentPrice])

  if (!currentPrice) return null

  const shares    = Math.max(100, Math.round(position.shares / 100) * 100 || 100)
  const contracts = Math.floor(shares / 100)
  const costBasis = position.costBasis

  const resistance = computeResistance(candles)
  const isEtf      = isEtfLike(ticker, profile?.name)
  const isEuStyle  = isEuStyleTicker(ticker)

  const fridays = getNextFridays(4)
  const hasLive = liveContracts?.some(c => c.real)

  const rows = STRIKES.map(({ pct, premiumPct, label, suggested }, i) => {
    const estStrike   = Math.ceil(currentPrice * (1 + pct))
    const estExpiry   = fridays[i]
    const estPremium  = +(estStrike * premiumPct).toFixed(2)

    const live        = liveContracts?.[i]
    const useReal     = live?.real && live?.premium != null

    const strike        = useReal ? live.strike       : estStrike
    const expiry        = useReal ? live.expiry       : null
    const premiumPer    = useReal ? live.premium      : estPremium
    const premiumTotal  = premiumPer * shares
    const maxProfit     = premiumTotal + (strike - currentPrice) * shares
    const roi           = (maxProfit / (currentPrice * shares)) * 100
    const iv            = useReal ? live.iv           : null

    // Breakeven — the price under which selling the covered call plus the
    // long shares would net a loss vs cost basis. Uses cost basis when
    // provided, current price otherwise.
    const anchor        = costBasis ?? currentPrice
    const breakeven     = anchor - premiumPer
    // Downside protection = premium as a share of the anchor. This is what
    // the premium "buys" you before you dip into anchor-basis losses.
    const downsidePct   = (premiumPer / anchor) * 100

    // Strike vs resistance — the tag ("above resistance" is bullish for the
    // seller: the call is less likely to be exercised).
    let resistanceNote = null
    if (resistance) {
      resistanceNote = strike >= resistance
        ? { text: `strike above resistance $${resistance.toFixed(2)}`, color: '#22B585' }
        : { text: `strike below resistance $${resistance.toFixed(2)}`, color: '#e3a234' }
    }

    return {
      label, strike, expiry, estExpiry,
      premiumPer, premiumTotal, maxProfit, roi,
      suggested: !!suggested, real: useReal, iv,
      breakeven, downsidePct, resistanceNote,
    }
  })

  return (
    <div className="w-full glass-card rounded-2xl p-4 sm:p-5 flex flex-col gap-4 animate-enter">

      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <span className="text-[11px] font-semibold text-[var(--c-text-faint)] uppercase tracking-[0.12em]">
            Covered Call Scanner
            {ticker && <span className="text-[var(--c-text-fainter)] font-normal ml-1.5">· {ticker}</span>}
          </span>
          <p className="text-[10px] text-[var(--c-text-fainter)] mt-0.5">Sell calls on your long position</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {fetchingLive && (
            <div className="w-3 h-3 rounded-full border border-transparent border-t-[#22B585] animate-spin" />
          )}
          {!fetchingLive && hasLive && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-[#22B585] uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22B585]" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Position inputs */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">
            Shares owned
          </span>
          <input
            type="number"
            min="100"
            step="100"
            value={position.shares || ''}
            onChange={e => setPosition(p => ({ ...p, shares: e.target.value ? Math.max(0, +e.target.value) : 0 }))}
            placeholder="200"
            className="w-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors"
          />
          <span className="text-[10px] text-[var(--c-text-fainter)]">= {contracts} contract{contracts === 1 ? '' : 's'}</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">
            Cost basis / share
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={position.costBasis ?? ''}
            onChange={e => setPosition(p => ({ ...p, costBasis: e.target.value ? +e.target.value : null }))}
            placeholder={`e.g. ${(currentPrice * 0.9).toFixed(2)}`}
            className="w-full bg-[var(--c-input-bg)] border border-[var(--c-input-border)] rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-[var(--c-text)] placeholder-[var(--c-input-placeholder)] outline-none focus:border-[#22B585] transition-colors"
          />
          <span className="text-[10px] text-[var(--c-text-fainter)]">
            {costBasis ? `Current: ${fmtPrice(currentPrice)} (${((currentPrice - costBasis) / costBasis * 100).toFixed(1)}%)` : `Blank → uses current price ${fmtPrice(currentPrice)}`}
          </span>
        </label>
      </div>

      {/* ETF / European-settlement notice */}
      {(isEtf || isEuStyle) && (
        <div className="border border-[#e3a234]/25 bg-[#e3a234]/8 rounded-lg p-3 flex gap-2 text-[11px] leading-relaxed text-[var(--c-text)]/85">
          <span className="text-[#e3a234] shrink-0">ⓘ</span>
          <span>
            {isEuStyle
              ? <><strong>Cash-settled, European-style.</strong> {ticker} options can only be exercised at expiration and settle in cash — no shares change hands. Assignment risk before expiry is zero.</>
              : <><strong>ETF options.</strong> Most ETF options (SPY, QQQ, etc.) are American-style and physically settled — same mechanics as equity CCs. Broad-index ETFs sometimes have very tight bid/ask, so the estimated premium may over-state the true credit.</>
            }
          </span>
        </div>
      )}

      {/* Scrollable table */}
      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
        <div className="min-w-[720px]">

          {/* Column headers */}
          <div className="grid grid-cols-[48px_72px_72px_120px_88px_88px_1fr] items-center gap-3 pb-2 border-b border-[var(--c-border)]">
            <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">OTM</span>
            <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Strike</span>
            <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Expiry</span>
            <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Est. Premium</span>
            <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Breakeven</span>
            <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest">Downside</span>
            <span className="text-[9px] font-bold text-[var(--c-text-fainter)] uppercase tracking-widest text-right">Max Profit / ROI</span>
          </div>

          {/* Data rows */}
          {rows.map(row => (
            <div
              key={row.label}
              className={`relative grid grid-cols-[48px_72px_72px_120px_88px_88px_1fr] items-center gap-3 py-3 border-b border-[var(--c-border)] last:border-0 ${
                row.suggested ? 'bg-[#22B585]/[0.04] rounded-lg' : ''
              }`}
            >
              {row.suggested && (
                <span className="absolute left-0 top-3 bottom-3 w-[3px] bg-[#22B585] rounded-r-full" />
              )}

              <span className="text-[10px] font-bold text-[var(--c-text-faint)] tabular-nums pl-1">
                {row.label}
              </span>

              <span className="text-xs font-bold text-[var(--c-text)] tabular-nums">
                ${row.strike.toLocaleString()}
              </span>

              <span className="text-xs text-[var(--c-text-faint)]">
                {row.expiry ? fmtExpiry(row.expiry) : fmtExpiryFromDate(row.estExpiry)}
              </span>

              <div>
                <p className="text-xs text-[var(--c-text)] tabular-nums leading-none">
                  ${row.premiumPer.toFixed(2)}<span className="text-[var(--c-text-faint)]">/sh</span>
                  {!row.real && <span className="text-[var(--c-text-fainter)] ml-1 text-[9px]">(est.)</span>}
                </p>
                <p className="text-[9px] text-[var(--c-text-faint)] tabular-nums mt-0.5">
                  {fmtMoney(row.premiumTotal)} total
                  {row.real && row.iv != null && (
                    <span className="ml-1 text-[var(--c-text-fainter)]">IV {(row.iv * 100).toFixed(0)}%</span>
                  )}
                </p>
              </div>

              <span className="text-xs tabular-nums text-[var(--c-text)]">{fmtPrice(row.breakeven)}</span>

              <span className="text-xs tabular-nums text-[#22B585] font-semibold">{fmtPct(row.downsidePct)}</span>

              <div className="flex flex-col items-end gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#22B585] tabular-nums">{fmtMoney(row.maxProfit)}</span>
                  <span className="text-[10px] font-bold text-[#22B585] tabular-nums">· {row.roi.toFixed(1)}%</span>
                  {row.suggested && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#22B585]/10 text-[#22B585] border border-[#22B585]/25 uppercase tracking-widest">
                      Suggested
                    </span>
                  )}
                </div>
                {row.resistanceNote && (
                  <span className="text-[9px] tabular-nums" style={{ color: row.resistanceNote.color }}>
                    {row.resistanceNote.text}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[10px] text-[var(--c-text-fainter)] leading-relaxed border-t border-[var(--c-border)] pt-3">
        {hasLive
          ? `Live premiums via Polygon.io · midpoint of bid/ask · ${contracts} contract${contracts === 1 ? '' : 's'} (${shares} shares)`
          : `Estimated premiums (Polygon quotes unavailable) · ${contracts} contract${contracts === 1 ? '' : 's'} (${shares} shares) · verify with your broker`
        }
      </p>
    </div>
  )
}
