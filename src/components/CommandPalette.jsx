import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Searchable library of popular symbols. Stocks + ETFs across sectors with
// real company / fund names so users can type either ("apple" or "AAPL",
// "russell 2000" or "IWM"). Server-side fallback via Finnhub/Yahoo still
// catches anything not in this list.
const POPULAR = [
  // ── Broad-market ETFs ──────────────────────────────────────────────────────
  { sym: 'SPY',  name: 'SPDR S&P 500 ETF Trust',          ex: 'NYSE' },
  { sym: 'IVV',  name: 'iShares Core S&P 500 ETF',        ex: 'NYSE' },
  { sym: 'VOO',  name: 'Vanguard S&P 500 ETF',            ex: 'NYSE' },
  { sym: 'VTI',  name: 'Vanguard Total Stock Market ETF', ex: 'NYSE' },
  { sym: 'QQQ',  name: 'Invesco QQQ Trust (Nasdaq 100)',  ex: 'NDQ'  },
  { sym: 'QQQM', name: 'Invesco Nasdaq 100 ETF',          ex: 'NDQ'  },
  { sym: 'DIA',  name: 'SPDR Dow Jones Industrial ETF',   ex: 'NYSE' },
  { sym: 'IWM',  name: 'iShares Russell 2000 ETF',        ex: 'NYSE' },
  { sym: 'IWB',  name: 'iShares Russell 1000 ETF',        ex: 'NYSE' },
  { sym: 'IJR',  name: 'iShares Core S&P Small-Cap ETF',  ex: 'NYSE' },
  { sym: 'MDY',  name: 'SPDR S&P MidCap 400 ETF',         ex: 'NYSE' },
  { sym: 'VT',   name: 'Vanguard Total World Stock ETF',  ex: 'NYSE' },
  { sym: 'VTV',  name: 'Vanguard Value ETF',              ex: 'NYSE' },
  { sym: 'VUG',  name: 'Vanguard Growth ETF',             ex: 'NYSE' },
  { sym: 'SCHD', name: 'Schwab US Dividend Equity ETF',   ex: 'NYSE' },
  { sym: 'DGRO', name: 'iShares Core Dividend Growth ETF',ex: 'NYSE' },

  // ── Sector SPDRs ───────────────────────────────────────────────────────────
  { sym: 'XLK',  name: 'Technology Select Sector SPDR',   ex: 'NYSE' },
  { sym: 'XLF',  name: 'Financial Select Sector SPDR',    ex: 'NYSE' },
  { sym: 'XLE',  name: 'Energy Select Sector SPDR',       ex: 'NYSE' },
  { sym: 'XLV',  name: 'Health Care Select Sector SPDR',  ex: 'NYSE' },
  { sym: 'XLY',  name: 'Consumer Discretionary SPDR',     ex: 'NYSE' },
  { sym: 'XLP',  name: 'Consumer Staples SPDR',           ex: 'NYSE' },
  { sym: 'XLI',  name: 'Industrial Select Sector SPDR',   ex: 'NYSE' },
  { sym: 'XLU',  name: 'Utilities Select Sector SPDR',    ex: 'NYSE' },
  { sym: 'XLB',  name: 'Materials Select Sector SPDR',    ex: 'NYSE' },
  { sym: 'XLRE', name: 'Real Estate Select Sector SPDR',  ex: 'NYSE' },
  { sym: 'XLC',  name: 'Communication Services SPDR',     ex: 'NYSE' },

  // ── Thematic / specialty ETFs ──────────────────────────────────────────────
  { sym: 'ARKK', name: 'ARK Innovation ETF',              ex: 'NYSE' },
  { sym: 'ARKW', name: 'ARK Next Generation Internet ETF',ex: 'NYSE' },
  { sym: 'ARKG', name: 'ARK Genomic Revolution ETF',      ex: 'NYSE' },
  { sym: 'ARKQ', name: 'ARK Autonomous Tech & Robotics',  ex: 'NYSE' },
  { sym: 'ARKX', name: 'ARK Space Exploration ETF',       ex: 'NYSE' },
  { sym: 'SMH',  name: 'VanEck Semiconductor ETF',        ex: 'NDQ'  },
  { sym: 'SOXX', name: 'iShares Semiconductor ETF',       ex: 'NDQ'  },
  { sym: 'IGV',  name: 'iShares Expanded Tech-Software',  ex: 'NYSE' },
  { sym: 'IBIT', name: 'iShares Bitcoin Trust ETF',       ex: 'NDQ'  },
  { sym: 'FBTC', name: 'Fidelity Wise Origin Bitcoin',    ex: 'NYSE' },
  { sym: 'ICLN', name: 'iShares Global Clean Energy ETF', ex: 'NDQ'  },
  { sym: 'TAN',  name: 'Invesco Solar ETF',               ex: 'NYSE' },
  { sym: 'LIT',  name: 'Global X Lithium & Battery Tech', ex: 'NYSE' },
  { sym: 'DRIV', name: 'Global X Autonomous & EV ETF',    ex: 'NDQ'  },
  { sym: 'KWEB', name: 'KraneShares China Internet ETF',  ex: 'NYSE' },
  { sym: 'ROBO', name: 'Robo Global Robotics & AI ETF',   ex: 'NYSE' },
  { sym: 'BOTZ', name: 'Global X Robotics & AI ETF',      ex: 'NDQ'  },
  { sym: 'JETS', name: 'US Global Jets ETF',              ex: 'NYSE' },

  // ── Bond / fixed income ETFs ───────────────────────────────────────────────
  { sym: 'BND',  name: 'Vanguard Total Bond Market ETF',  ex: 'NDQ'  },
  { sym: 'AGG',  name: 'iShares Core US Aggregate Bond',  ex: 'NYSE' },
  { sym: 'TLT',  name: 'iShares 20+ Year Treasury Bond',  ex: 'NDQ'  },
  { sym: 'IEF',  name: 'iShares 7-10 Year Treasury Bond', ex: 'NDQ'  },
  { sym: 'SHY',  name: 'iShares 1-3 Year Treasury Bond',  ex: 'NDQ'  },
  { sym: 'LQD',  name: 'iShares Investment Grade Corp',   ex: 'NYSE' },
  { sym: 'HYG',  name: 'iShares iBoxx High Yield Corp',   ex: 'NYSE' },
  { sym: 'JNK',  name: 'SPDR Bloomberg High Yield Bond',  ex: 'NYSE' },
  { sym: 'TIP',  name: 'iShares TIPS Bond ETF',           ex: 'NYSE' },
  { sym: 'BIL',  name: 'SPDR 1-3 Month T-Bill ETF',       ex: 'NYSE' },

  // ── Commodity ETFs ─────────────────────────────────────────────────────────
  { sym: 'GLD',  name: 'SPDR Gold Trust',                 ex: 'NYSE' },
  { sym: 'IAU',  name: 'iShares Gold Trust',              ex: 'NYSE' },
  { sym: 'GDX',  name: 'VanEck Gold Miners ETF',          ex: 'NYSE' },
  { sym: 'SLV',  name: 'iShares Silver Trust',            ex: 'NYSE' },
  { sym: 'USO',  name: 'United States Oil Fund',          ex: 'NYSE' },
  { sym: 'UNG',  name: 'United States Natural Gas Fund',  ex: 'NYSE' },
  { sym: 'DBC',  name: 'Invesco DB Commodity Index',      ex: 'NYSE' },

  // ── International ETFs ─────────────────────────────────────────────────────
  { sym: 'EFA',  name: 'iShares MSCI EAFE ETF',           ex: 'NYSE' },
  { sym: 'EEM',  name: 'iShares MSCI Emerging Markets',   ex: 'NYSE' },
  { sym: 'VEA',  name: 'Vanguard FTSE Developed Markets', ex: 'NYSE' },
  { sym: 'VWO',  name: 'Vanguard FTSE Emerging Markets',  ex: 'NYSE' },
  { sym: 'EWZ',  name: 'iShares MSCI Brazil ETF',         ex: 'NYSE' },
  { sym: 'EWJ',  name: 'iShares MSCI Japan ETF',          ex: 'NYSE' },
  { sym: 'INDA', name: 'iShares MSCI India ETF',          ex: 'NDQ'  },
  { sym: 'MCHI', name: 'iShares MSCI China ETF',          ex: 'NDQ'  },
  { sym: 'FXI',  name: 'iShares China Large-Cap ETF',     ex: 'NYSE' },

  // ── Volatility / leveraged ETFs ────────────────────────────────────────────
  { sym: 'VXX',  name: 'iPath Series B S&P 500 VIX',      ex: 'NYSE' },
  { sym: 'UVXY', name: 'ProShares Ultra VIX Short-Term',  ex: 'NYSE' },
  { sym: 'TQQQ', name: 'ProShares UltraPro QQQ (3x)',     ex: 'NDQ'  },
  { sym: 'SQQQ', name: 'ProShares UltraPro Short QQQ',    ex: 'NDQ'  },
  { sym: 'SPXL', name: 'Direxion Daily S&P 500 Bull 3X',  ex: 'NYSE' },
  { sym: 'SPXS', name: 'Direxion Daily S&P 500 Bear 3X',  ex: 'NYSE' },
  { sym: 'SOXL', name: 'Direxion Daily Semis Bull 3X',    ex: 'NYSE' },
  { sym: 'SOXS', name: 'Direxion Daily Semis Bear 3X',    ex: 'NYSE' },

  // ── Mega + large-cap tech ──────────────────────────────────────────────────
  { sym: 'AAPL', name: 'Apple Inc',                       ex: 'NDQ'  },
  { sym: 'MSFT', name: 'Microsoft Corp',                  ex: 'NDQ'  },
  { sym: 'NVDA', name: 'NVIDIA Corp',                     ex: 'NDQ'  },
  { sym: 'GOOGL',name: 'Alphabet Inc (Class A)',          ex: 'NDQ'  },
  { sym: 'GOOG', name: 'Alphabet Inc (Class C)',          ex: 'NDQ'  },
  { sym: 'META', name: 'Meta Platforms',                  ex: 'NDQ'  },
  { sym: 'AMZN', name: 'Amazon.com',                      ex: 'NDQ'  },
  { sym: 'TSLA', name: 'Tesla Inc',                       ex: 'NDQ'  },
  { sym: 'NFLX', name: 'Netflix Inc',                     ex: 'NDQ'  },
  { sym: 'ADBE', name: 'Adobe Inc',                       ex: 'NDQ'  },
  { sym: 'ORCL', name: 'Oracle Corp',                     ex: 'NYSE' },
  { sym: 'CRM',  name: 'Salesforce',                      ex: 'NYSE' },
  { sym: 'INTC', name: 'Intel Corp',                      ex: 'NDQ'  },
  { sym: 'IBM',  name: 'IBM Corp',                        ex: 'NYSE' },
  { sym: 'CSCO', name: 'Cisco Systems',                   ex: 'NDQ'  },
  { sym: 'QCOM', name: 'Qualcomm',                        ex: 'NDQ'  },
  { sym: 'TXN',  name: 'Texas Instruments',               ex: 'NDQ'  },

  // ── Semis & AI infrastructure ──────────────────────────────────────────────
  { sym: 'AMD',  name: 'Advanced Micro Devices',          ex: 'NDQ'  },
  { sym: 'AVGO', name: 'Broadcom Inc',                    ex: 'NDQ'  },
  { sym: 'TSM',  name: 'Taiwan Semiconductor',            ex: 'NYSE' },
  { sym: 'ASML', name: 'ASML Holding',                    ex: 'NDQ'  },
  { sym: 'ARM',  name: 'Arm Holdings',                    ex: 'NDQ'  },
  { sym: 'MU',   name: 'Micron Technology',               ex: 'NDQ'  },
  { sym: 'MRVL', name: 'Marvell Technology',              ex: 'NDQ'  },
  { sym: 'AMAT', name: 'Applied Materials',               ex: 'NDQ'  },
  { sym: 'LRCX', name: 'Lam Research',                    ex: 'NDQ'  },
  { sym: 'KLAC', name: 'KLA Corp',                        ex: 'NDQ'  },

  // ── Cloud / cybersecurity / data ───────────────────────────────────────────
  { sym: 'SNOW', name: 'Snowflake Inc',                   ex: 'NYSE' },
  { sym: 'NET',  name: 'Cloudflare',                      ex: 'NYSE' },
  { sym: 'DDOG', name: 'Datadog',                         ex: 'NDQ'  },
  { sym: 'MDB',  name: 'MongoDB',                         ex: 'NDQ'  },
  { sym: 'OKTA', name: 'Okta Inc',                        ex: 'NDQ'  },
  { sym: 'ZS',   name: 'Zscaler',                         ex: 'NDQ'  },
  { sym: 'CRWD', name: 'CrowdStrike Holdings',            ex: 'NDQ'  },
  { sym: 'PANW', name: 'Palo Alto Networks',              ex: 'NDQ'  },
  { sym: 'PLTR', name: 'Palantir Technologies',           ex: 'NYSE' },

  // ── EV + autos ─────────────────────────────────────────────────────────────
  { sym: 'F',    name: 'Ford Motor',                      ex: 'NYSE' },
  { sym: 'GM',   name: 'General Motors',                  ex: 'NYSE' },
  { sym: 'RIVN', name: 'Rivian Automotive',               ex: 'NDQ'  },
  { sym: 'LCID', name: 'Lucid Group',                     ex: 'NDQ'  },
  { sym: 'NIO',  name: 'NIO Inc',                         ex: 'NYSE' },
  { sym: 'XPEV', name: 'XPeng Inc',                       ex: 'NYSE' },
  { sym: 'LI',   name: 'Li Auto',                         ex: 'NDQ'  },

  // ── Space + defense ────────────────────────────────────────────────────────
  { sym: 'RKLB', name: 'Rocket Lab USA',                  ex: 'NDQ'  },
  { sym: 'LUNR', name: 'Intuitive Machines',              ex: 'NDQ'  },
  { sym: 'ASTS', name: 'AST SpaceMobile',                 ex: 'NDQ'  },
  { sym: 'SPCE', name: 'Virgin Galactic',                 ex: 'NYSE' },
  { sym: 'LMT',  name: 'Lockheed Martin',                 ex: 'NYSE' },
  { sym: 'BA',   name: 'Boeing',                          ex: 'NYSE' },
  { sym: 'RTX',  name: 'RTX Corp (Raytheon)',             ex: 'NYSE' },
  { sym: 'NOC',  name: 'Northrop Grumman',                ex: 'NYSE' },
  { sym: 'GD',   name: 'General Dynamics',                ex: 'NYSE' },

  // ── Banks & finance ────────────────────────────────────────────────────────
  { sym: 'JPM',  name: 'JPMorgan Chase',                  ex: 'NYSE' },
  { sym: 'BAC',  name: 'Bank of America',                 ex: 'NYSE' },
  { sym: 'WFC',  name: 'Wells Fargo',                     ex: 'NYSE' },
  { sym: 'GS',   name: 'Goldman Sachs',                   ex: 'NYSE' },
  { sym: 'MS',   name: 'Morgan Stanley',                  ex: 'NYSE' },
  { sym: 'C',    name: 'Citigroup',                       ex: 'NYSE' },
  { sym: 'BRK.B',name: 'Berkshire Hathaway (Class B)',    ex: 'NYSE' },
  { sym: 'AXP',  name: 'American Express',                ex: 'NYSE' },
  { sym: 'V',    name: 'Visa Inc',                        ex: 'NYSE' },
  { sym: 'MA',   name: 'Mastercard',                      ex: 'NYSE' },
  { sym: 'BLK',  name: 'BlackRock',                       ex: 'NYSE' },

  // ── Fintech & crypto-adjacent ──────────────────────────────────────────────
  { sym: 'PYPL', name: 'PayPal Holdings',                 ex: 'NDQ'  },
  { sym: 'SQ',   name: 'Block Inc (Square)',              ex: 'NYSE' },
  { sym: 'SOFI', name: 'SoFi Technologies',               ex: 'NDQ'  },
  { sym: 'COIN', name: 'Coinbase Global',                 ex: 'NDQ'  },
  { sym: 'HOOD', name: 'Robinhood Markets',               ex: 'NDQ'  },
  { sym: 'AFRM', name: 'Affirm Holdings',                 ex: 'NDQ'  },
  { sym: 'MSTR', name: 'MicroStrategy',                   ex: 'NDQ'  },
  { sym: 'RIOT', name: 'Riot Platforms',                  ex: 'NDQ'  },
  { sym: 'MARA', name: 'Marathon Digital',                ex: 'NDQ'  },

  // ── Health & pharma ────────────────────────────────────────────────────────
  { sym: 'UNH',  name: 'UnitedHealth Group',              ex: 'NYSE' },
  { sym: 'JNJ',  name: 'Johnson & Johnson',               ex: 'NYSE' },
  { sym: 'LLY',  name: 'Eli Lilly',                       ex: 'NYSE' },
  { sym: 'PFE',  name: 'Pfizer',                          ex: 'NYSE' },
  { sym: 'MRK',  name: 'Merck & Co',                      ex: 'NYSE' },
  { sym: 'ABBV', name: 'AbbVie',                          ex: 'NYSE' },
  { sym: 'ABT',  name: 'Abbott Laboratories',             ex: 'NYSE' },
  { sym: 'MRNA', name: 'Moderna',                         ex: 'NDQ'  },
  { sym: 'NVO',  name: 'Novo Nordisk',                    ex: 'NYSE' },

  // ── Consumer / retail ──────────────────────────────────────────────────────
  { sym: 'WMT',  name: 'Walmart',                         ex: 'NYSE' },
  { sym: 'COST', name: 'Costco Wholesale',                ex: 'NDQ'  },
  { sym: 'TGT',  name: 'Target Corp',                     ex: 'NYSE' },
  { sym: 'HD',   name: 'Home Depot',                      ex: 'NYSE' },
  { sym: 'LOW',  name: 'Lowe’s Companies',           ex: 'NYSE' },
  { sym: 'NKE',  name: 'Nike Inc',                        ex: 'NYSE' },
  { sym: 'SBUX', name: 'Starbucks',                       ex: 'NDQ'  },
  { sym: 'MCD',  name: 'McDonald’s Corp',            ex: 'NYSE' },
  { sym: 'KO',   name: 'Coca-Cola',                       ex: 'NYSE' },
  { sym: 'PEP',  name: 'PepsiCo',                         ex: 'NDQ'  },
  { sym: 'DIS',  name: 'Walt Disney',                     ex: 'NYSE' },

  // ── Energy ─────────────────────────────────────────────────────────────────
  { sym: 'XOM',  name: 'Exxon Mobil',                     ex: 'NYSE' },
  { sym: 'CVX',  name: 'Chevron',                         ex: 'NYSE' },
  { sym: 'COP',  name: 'ConocoPhillips',                  ex: 'NYSE' },
  { sym: 'OXY',  name: 'Occidental Petroleum',            ex: 'NYSE' },
  { sym: 'SLB',  name: 'Schlumberger',                    ex: 'NYSE' },

  // ── Industrial + materials ─────────────────────────────────────────────────
  { sym: 'CAT',  name: 'Caterpillar',                     ex: 'NYSE' },
  { sym: 'DE',   name: 'Deere & Co',                      ex: 'NYSE' },
  { sym: 'GE',   name: 'GE Aerospace',                    ex: 'NYSE' },
  { sym: 'HON',  name: 'Honeywell International',         ex: 'NYSE' },
  { sym: 'MMM',  name: '3M Company',                      ex: 'NYSE' },
  { sym: 'UPS',  name: 'United Parcel Service',           ex: 'NYSE' },
  { sym: 'FDX',  name: 'FedEx Corp',                      ex: 'NYSE' },
  { sym: 'FCX',  name: 'Freeport-McMoRan',                ex: 'NYSE' },
  { sym: 'NEM',  name: 'Newmont Corp',                    ex: 'NYSE' },

  // ── Comms / telecom ────────────────────────────────────────────────────────
  { sym: 'T',    name: 'AT&T',                            ex: 'NYSE' },
  { sym: 'VZ',   name: 'Verizon Communications',          ex: 'NYSE' },
  { sym: 'TMUS', name: 'T-Mobile US',                     ex: 'NDQ'  },
  { sym: 'CMCSA',name: 'Comcast',                         ex: 'NDQ'  },

  // ── REITs ──────────────────────────────────────────────────────────────────
  { sym: 'O',    name: 'Realty Income Corp',              ex: 'NYSE' },
  { sym: 'AMT',  name: 'American Tower',                  ex: 'NYSE' },
  { sym: 'PLD',  name: 'Prologis',                        ex: 'NYSE' },
  { sym: 'EQIX', name: 'Equinix',                         ex: 'NDQ'  },
  { sym: 'CCI',  name: 'Crown Castle',                    ex: 'NYSE' },
  { sym: 'SPG',  name: 'Simon Property Group',            ex: 'NYSE' },

  // ── Foreign ADRs ───────────────────────────────────────────────────────────
  { sym: 'BABA', name: 'Alibaba Group',                   ex: 'NYSE' },
  { sym: 'JD',   name: 'JD.com',                          ex: 'NDQ'  },
  { sym: 'PDD',  name: 'PDD Holdings (Pinduoduo)',        ex: 'NDQ'  },
  { sym: 'BIDU', name: 'Baidu Inc',                       ex: 'NDQ'  },
  { sym: 'SHOP', name: 'Shopify Inc',                     ex: 'NYSE' },
  { sym: 'SE',   name: 'Sea Limited',                     ex: 'NYSE' },
  { sym: 'MELI', name: 'MercadoLibre',                    ex: 'NDQ'  },
]

const SECTIONS = [
  { key: 'pulse',     label: 'Open The Pulse', sub: 'Live intraday watchlist dashboard', jump: 'pulse'    },
  { key: 'screener',  label: 'Open Screener',  sub: 'Filter and rank stocks',          jump: 'screener'  },
  { key: 'portfolio', label: 'Open Portfolio', sub: 'Holdings, returns, AI summary',   jump: 'portfolio' },
  { key: 'sectors',   label: 'Open Sectors',   sub: 'Sector heatmap',                  jump: 'sectors'   },
  { key: 'compare',   label: 'Open Compare',   sub: 'Side-by-side ticker comparison',  jump: 'compare'   },
  { key: 'alerts',    label: 'Price Alerts',   sub: 'Scroll to alert configuration',   jump: 'alerts'    },
  { key: 'news',      label: 'News Feed',      sub: 'Scroll to news for current ticker', jump: 'news'    },
]

function getRecent() {
  try { return JSON.parse(localStorage.getItem('kairo_recent') ?? '[]') }
  catch { return [] }
}

function fuzzy(query, ...fields) {
  if (!query) return true
  const q = query.toLowerCase()
  return fields.some(f => f && String(f).toLowerCase().includes(q))
}

function ResultRow({ item, active, onSelect }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}  // keep input focus through click
      onClick={onSelect}
      data-active={active || undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-left transition-colors ${
        active
          ? 'bg-[#22B585]/10 border border-[#22B585]/25'
          : 'border border-transparent hover:bg-[var(--c-hover-bg)]'
      }`}
    >
      {/* Leading icon: ticker mono / section glyph / search magnifier */}
      <span className={`shrink-0 w-9 h-9 rounded-md border flex items-center justify-center font-mono text-[10px] font-bold tabular-nums ${
        item.kind === 'section'
          ? 'border-[var(--c-border)] bg-[var(--c-input-bg)] text-[var(--c-text-faint)]'
          : 'border-[#22B585]/25 bg-[#22B585]/5 text-[#22B585]'
      }`}>
        {item.kind === 'ticker' || item.kind === 'recent' ? item.sym
          : item.kind === 'search' ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )
          : '⌘'}
      </span>

      {/* Label + sub */}
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-sm font-semibold text-[var(--c-text)] truncate">
          {item.kind === 'ticker' ? `${item.sym}`
            : item.kind === 'search' ? <>Search for <span className="font-mono text-[#22B585]">{item.sym}</span></>
            : item.label}
          {item.kind === 'ticker' && item.name && (
            <span className="ml-2 text-[var(--c-text-faint)] font-normal">{item.name}</span>
          )}
        </span>
        {item.sub && <span className="text-[11px] text-[var(--c-text-faint)] truncate">{item.sub}</span>}
      </span>

      {/* Trailing badge: exchange or hint */}
      {item.kind === 'ticker' && (
        <span className="shrink-0 font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--c-text-muted)]">{item.ex}</span>
      )}
      {item.kind === 'recent' && (
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--c-text-muted)]">Recent</span>
      )}
      {item.kind === 'search' && (
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-[var(--c-text-muted)]">Look up</span>
      )}
      {active && (
        <span className="shrink-0 font-mono text-[11px] text-[#22B585]">↵</span>
      )}
    </button>
  )
}

function GroupHeader({ children }) {
  return (
    <div className="px-3 pt-3 pb-1.5 text-[10.5px] uppercase tracking-[0.16em] font-semibold text-[var(--c-text-muted)]">
      {children}
    </div>
  )
}

export default function CommandPalette({ open, onClose, onSelectTicker, onJumpTo }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef  = useRef(null)
  const recent   = useMemo(getRecent, [open])

  // Build full result list, then filter
  const all = useMemo(() => {
    const tickerKey = new Set(POPULAR.map(p => p.sym))
    const recentTickers = recent
      .filter(sym => sym && typeof sym === 'string')
      .filter(sym => !tickerKey.has(sym))   // dedupe vs POPULAR
      .map(sym => ({ kind: 'recent', sym, name: '', ex: '' }))

    return {
      recent:   recentTickers,
      tickers:  POPULAR.map(p => ({ kind: 'ticker', ...p })),
      sections: SECTIONS.map(s => ({ kind: 'section', ...s })),
    }
  }, [recent])

  const filtered = useMemo(() => {
    const q = query.trim()
    const f = {
      recent:   all.recent  .filter(i => fuzzy(q, i.sym)),
      tickers:  all.tickers .filter(i => fuzzy(q, i.sym, i.name)),
      sections: all.sections.filter(i => fuzzy(q, i.label, i.sub, i.key)),
    }
    return f
  }, [all, query])

  // "Search anything" fallback. If the user typed something that looks like a
  // valid ticker shape but it isn't in the curated list, surface a synthetic
  // option that dispatches the raw input — the server (Finnhub → Yahoo) will
  // resolve it. Mirrors the regex in api/_validate.js.
  const search = useMemo(() => {
    const upper = query.trim().toUpperCase()
    if (!/^[A-Z]{1,5}(\.[A-Z]{1,2})?$/.test(upper)) return null
    const knownSyms = new Set([
      ...all.recent  .map(i => i.sym),
      ...all.tickers.map(i => i.sym),
    ])
    if (knownSyms.has(upper)) return null
    return { kind: 'search', sym: upper, sub: 'Look up via Finnhub / Yahoo' }
  }, [query, all])

  // Flat list in render order — what arrow keys + Enter operate on.
  // The synthetic search row goes first so Enter on an unknown symbol "just works".
  const flat = useMemo(
    () => [
      ...(search ? [search] : []),
      ...filtered.recent,
      ...filtered.tickers,
      ...filtered.sections,
    ],
    [search, filtered],
  )

  // Reset state when closed; focus input when opened.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setActive(0)
      return
    }
    // Defer focus to next tick so the modal is mounted
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Reset active when filter changes
  useEffect(() => { setActive(0) }, [query])

  // Keyboard navigation within the palette
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive(a => Math.min(flat.length - 1, a + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(a => Math.max(0, a - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = flat[active]
        if (item) handleSelect(item)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flat, active])

  // Scroll active row into view
  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active]')
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  function handleSelect(item) {
    if (item.kind === 'ticker' || item.kind === 'recent' || item.kind === 'search') {
      onSelectTicker?.(item.sym)
    } else if (item.kind === 'section') {
      onJumpTo?.(item.jump)
    }
    onClose?.()
  }

  // Compute global index per item for keyboard highlighting
  let idx = -1
  const renderRow = (item) => {
    idx += 1
    return (
      <ResultRow
        key={`${item.kind}-${item.sym ?? item.key}`}
        item={item}
        active={idx === active}
        onSelect={() => handleSelect(item)}
      />
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 animate-fade"
      onMouseDown={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--c-overlay)] backdrop-blur-sm" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="glass-strong relative w-full max-w-[520px] rounded-2xl overflow-hidden animate-enter origin-top"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--c-border)]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--c-text-faint)] shrink-0">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or jump to section…"
            className="flex-1 bg-transparent text-sm text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] outline-none"
          />
          <span className="font-mono text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--c-text-muted)] border border-[var(--c-border-strong)] rounded px-1.5 py-0.5">
            Esc
          </span>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto px-2 py-2">
          {search && (
            <>
              <GroupHeader>Search</GroupHeader>
              {renderRow(search)}
            </>
          )}
          {filtered.recent.length > 0 && (
            <>
              <GroupHeader>Recent</GroupHeader>
              {filtered.recent.map(renderRow)}
            </>
          )}
          {filtered.tickers.length > 0 && (
            <>
              <GroupHeader>Tickers</GroupHeader>
              {filtered.tickers.map(renderRow)}
            </>
          )}
          {filtered.sections.length > 0 && (
            <>
              <GroupHeader>Sections</GroupHeader>
              {filtered.sections.map(renderRow)}
            </>
          )}
          {flat.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-[var(--c-text-faint)]">
              No matches. Try a different ticker or section name.
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[var(--c-border)] bg-[var(--c-bg)]/60 text-[11px] font-mono tracking-wide text-[var(--c-text-muted)]">
          <span className="flex items-center gap-2">
            <span><kbd className="text-[var(--c-text)] font-bold">↑↓</kbd> navigate</span>
            <span className="text-[var(--c-text-fainter)]">·</span>
            <span><kbd className="text-[var(--c-text)] font-bold">↵</kbd> select</span>
          </span>
          <span><kbd className="text-[var(--c-text)] font-bold">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
