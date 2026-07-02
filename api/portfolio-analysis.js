import { rateLimit } from '../lib/rateLimit.js'

// Sector maps for exposure detection. Broad and pragmatic — anything not in
// a map falls into 'Other'. Kept as data (not fancy taxonomy) so extending
// coverage is a one-line PR. Tickers in multiple maps count for both (rare
// in practice — CRM is pure tech, JPM is pure financial, etc.).
const SECTOR_MAP = {
  Technology: new Set([
    'AAPL','MSFT','NVDA','GOOGL','GOOG','META','AMZN','TSLA','AMD','INTC',
    'AVGO','QCOM','CRM','ORCL','ADBE','NFLX','UBER','LYFT','SNAP','PINS',
    'TWLO','NOW','SNOW','PLTR','HOOD','COIN','SMCI','ARM','MRVL','ASML',
    'TSM','CSCO','IBM','MU','LRCX','AMAT','KLAC','TEAM','SHOP','ZM',
    'ROKU','SPOT','SQ','ABNB','DDOG','NET','CRWD','ZS','OKTA','MDB',
  ]),
  Financials: new Set([
    'JPM','BAC','WFC','C','GS','MS','SCHW','BLK','SPGI','MCO',
    'AXP','V','MA','PYPL','COIN','BX','KKR','MET','PRU','AIG',
    'USB','PNC','TFC','COF','ALL','TRV',
  ]),
  Energy: new Set([
    'XOM','CVX','COP','SLB','EOG','OXY','PXD','PSX','MPC','VLO',
    'HAL','BKR','KMI','WMB','ET','ENB','TRP',
  ]),
  Healthcare: new Set([
    'UNH','JNJ','LLY','ABBV','MRK','TMO','ABT','PFE','BMY','AMGN',
    'GILD','DHR','MDT','SYK','ISRG','REGN','VRTX','CVS','CI','HUM',
    'ELV','MRNA','BNTX','NVAX',
  ]),
  'Consumer Discretionary': new Set([
    'AMZN','TSLA','HD','NKE','MCD','SBUX','LOW','TJX','BKNG','CMG',
    'ORLY','AZO','DIS','RCL','CCL','MAR','HLT','ROKU','ETSY','RIVN',
    'LCID','F','GM',
  ]),
  'Consumer Staples': new Set([
    'WMT','PG','KO','PEP','COST','MDLZ','PM','MO','CL','KMB',
    'GIS','KHC','K','HSY','STZ','DEO','EL',
  ]),
  Industrials: new Set([
    'BA','CAT','HON','GE','UPS','FDX','LMT','RTX','NOC','GD',
    'DE','MMM','ETN','EMR','ITW','WM','CSX','UNP','NSC',
  ]),
  'ETF/Broad': new Set([
    'SPY','QQQ','DIA','IWM','VOO','VTI','ARKK','SCHD','VYM','SPYG',
    'SPYV','XLE','XLF','XLV','XLK','XLI','XLU','XLY','XLP','XLB',
    'XLC','XLRE','TLT','HYG','LQD','GLD','SLV','TQQQ','SQQQ','UVXY',
  ]),
}

// Back-compat alias — the prior code referenced TECH_TICKERS directly.
const TECH_TICKERS = SECTOR_MAP.Technology

// Compute { sectorName → weight } for the current portfolio. Tickers that
// match none of the maps fall into 'Other' so the total still sums to 1.0.
function computeSectorWeights(holdings) {
  const weights = {}
  for (const h of holdings) {
    let matched = false
    for (const [sector, set] of Object.entries(SECTOR_MAP)) {
      if (set.has(h.ticker)) {
        weights[sector] = (weights[sector] ?? 0) + h.weight
        matched = true
      }
    }
    if (!matched) weights.Other = (weights.Other ?? 0) + h.weight
  }
  return weights
}

function buildPrompt({ holdings, snapshots, total, todayChangePct }) {
  const sorted    = [...holdings].sort((a, b) => b.weight - a.weight)
  const topPos    = sorted[0]
  const techWt    = sorted.filter(h => TECH_TICKERS.has(h.ticker)).reduce((s, h) => s + h.weight, 0)
  const posToday  = sorted.filter(h => (h.changePct ?? 0) > 0).length
  const maxWeight = topPos ? topPos.weight : 0

  // Sector breakdown — feeds a specific "sector exposure" section in the
  // prompt so the AI can name concentration in energy or financials, not
  // just tech. Sorted descending by weight; sectors under 1% omitted so
  // the model doesn't fixate on a rounding-error position.
  const sectorWeights = computeSectorWeights(sorted)
  const sectorLines   = Object.entries(sectorWeights)
    .filter(([, w]) => w >= 0.01)
    .sort((a, b) => b[1] - a[1])
    .map(([name, w]) => `  ${name.padEnd(24)} ${(w * 100).toFixed(1).padStart(5)}%`)
    .join('\n') || '  (no matched sectors)'

  const holdingsTable = sorted.map(h => {
    const wPct  = (h.weight * 100).toFixed(1).padStart(5)
    const chg   = h.changePct != null ? `${h.changePct >= 0 ? '+' : ''}${h.changePct.toFixed(2)}%` : 'N/A'
    const val   = h.value != null ? `$${Math.round(h.value).toLocaleString()}` : 'N/A'
    const unrlz = h.unrealizedPct != null
      ? `  unrealized ${h.unrealizedPct >= 0 ? '+' : ''}${h.unrealizedPct.toFixed(1)}%`
      : ''
    return `  ${h.ticker.padEnd(6)} ${wPct}%  ${val.padStart(10)}  today ${chg}${unrlz}`
  }).join('\n')

  let perfContext = 'No historical snapshot data yet — cannot assess trend.'
  if (snapshots && snapshots.length >= 2) {
    const oldest = snapshots[0]
    const newest = snapshots[snapshots.length - 1]
    const days   = Math.round((new Date(newest.snapshot_date) - new Date(oldest.snapshot_date)) / 86_400_000)
    const pct    = ((newest.total_value - oldest.total_value) / oldest.total_value * 100).toFixed(2)
    const sign   = pct >= 0 ? '+' : ''
    perfContext   = `Last ${days} days: ${sign}${pct}%  ·  $${Number(oldest.total_value).toFixed(0)} → $${Number(newest.total_value).toFixed(0)}`
    if (snapshots.length >= 5) {
      const mid  = snapshots[Math.floor(snapshots.length / 2)]
      const half = ((newest.total_value - mid.total_value) / mid.total_value * 100).toFixed(2)
      perfContext += `\n  Recent half: ${half >= 0 ? '+' : ''}${half}% (trend ${half >= pct / 2 ? 'accelerating' : 'decelerating'})`
    }
  }

  return `You are a portfolio risk analyst at a top-tier hedge fund. Analyze this portfolio and return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.

PORTFOLIO SUMMARY:
- Total value: $${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Today's P&L: ${todayChangePct >= 0 ? '+' : ''}${todayChangePct.toFixed(2)}%
- Positions: ${holdings.length}
- Up today: ${posToday} / ${holdings.length}
- Largest position: ${topPos?.ticker ?? 'N/A'} at ${(maxWeight * 100).toFixed(1)}%
- Technology exposure: ~${(techWt * 100).toFixed(0)}%

SECTOR EXPOSURE (weight-adjusted):
${sectorLines}

HOLDINGS (sorted by portfolio weight):
${holdingsTable}

PERFORMANCE HISTORY:
${perfContext}

SCORING RUBRIC — apply all criteria:
- Concentration (0-30 pts): deduct if any position > 30%; heavily penalise > 40%
- Diversification (0-25 pts): reward sector mix; penalise if > 60% in tech
- Performance trend (0-25 pts): use snapshots to score momentum direction
- Risk-adjusted balance (0-20 pts): reward when gainers broadly distributed, not just one name

Be specific: cite actual tickers, percentages, dollar values. Never be generic. Tailor every observation to the exact holdings provided.

holdingSignals must cover EVERY ticker in the portfolio. Use exactly one of: ADD | HOLD | TRIM | EXIT.

Return ONLY this JSON structure — no markdown, no code fences, no extra keys:
{
  "overallScore": <integer 0-100>,
  "verdict": "STRONG" | "MODERATE" | "WEAK",
  "summary": "<2-3 sentences, specific observations about this exact portfolio — cite tickers and values>",
  "strengths": ["<strength citing specific ticker or metric>", "<second strength>"],
  "risks": ["<risk citing specific ticker or percentage>", "<second risk>"],
  "holdingSignals": [
    { "ticker": "<TICKER>", "action": "ADD" | "HOLD" | "TRIM" | "EXIT", "note": "<one sentence with a specific reason>" }
  ],
  "rebalanceIdea": "<1-2 sentences with a concrete, actionable rebalancing suggestion citing specific tickers and target weights>",
  "topRecommendation": "<the single highest-priority action to take right now, naming the specific ticker and rationale>"
}`
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  const apiKey = process.env.GROQ_API_KEY ?? process.env.VITE_GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'AI service unavailable' })

  const { holdings, snapshots, total, todayChangePct } = req.body ?? {}

  if (!Array.isArray(holdings) || holdings.length === 0 || holdings.length > 20) {
    return res.status(400).json({ error: 'Invalid holdings' })
  }
  if (typeof total !== 'number' || total <= 0) {
    return res.status(400).json({ error: 'Invalid total' })
  }

  const prompt = buildPrompt({ holdings, snapshots: snapshots ?? [], total, todayChangePct: todayChangePct ?? 0 })

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'You are a portfolio risk analyst. Return ONLY valid JSON with no markdown fences. ' +
              'Be specific and cite actual tickers and percentages — never give generic advice. ' +
              'overallScore must reflect the scoring rubric, not just today\'s P&L. ' +
              'holdingSignals must include an entry for every ticker provided.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    })

    if (!groqRes.ok) return res.status(502).json({ error: 'AI service error' })

    const json = await groqRes.json()
    const raw  = json.choices?.[0]?.message?.content ?? ''

    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return res.status(502).json({ error: 'Malformed AI response' })

    let analysis
    try { analysis = JSON.parse(raw.slice(start, end + 1)) }
    catch { return res.status(502).json({ error: 'Malformed AI response' }) }

    // Normalise verdict
    const v = String(analysis.verdict ?? '').toUpperCase()
    analysis.verdict = ['STRONG', 'MODERATE', 'WEAK'].includes(v) ? v : 'MODERATE'

    // Normalise holdingSignals actions
    const VALID_ACTIONS = new Set(['ADD', 'HOLD', 'TRIM', 'EXIT'])
    if (Array.isArray(analysis.holdingSignals)) {
      analysis.holdingSignals = analysis.holdingSignals.map(s => ({
        ...s,
        ticker: String(s.ticker ?? '').toUpperCase(),
        action: VALID_ACTIONS.has(String(s.action ?? '').toUpperCase())
          ? String(s.action).toUpperCase()
          : 'HOLD',
      }))
    } else {
      analysis.holdingSignals = []
    }

    res.json(analysis)
  } catch {
    res.status(502).json({ error: 'AI service error' })
  }
}
