function rs(n) { return Math.round(n / 5) * 5 }
function prem(p) { return `$${Math.max(p, 0.05).toFixed(2)}` }
function oi(base) { return `${(base + Math.floor(Math.random() * 5000)).toLocaleString()}` }

export function getMockOptions(ticker, price) {
  const p = parseFloat(price) || 100
  return [
    {
      type: 'call',
      strike: rs(p * 1.05).toString(),
      expiry: 'Jun 20',
      oi: oi(38000),
      premium: prem(p * 0.022),
      note: '⚡ Unusual sweep',
      unusual: true,
    },
    {
      type: 'call',
      strike: rs(p * 1.10).toString(),
      expiry: 'Jul 18',
      oi: oi(24000),
      premium: prem(p * 0.011),
      note: 'High OI buildup',
      unusual: false,
    },
    {
      type: 'put',
      strike: rs(p * 0.95).toString(),
      expiry: 'Jun 20',
      oi: oi(19000),
      premium: prem(p * 0.016),
      note: 'Protective hedge',
      unusual: false,
    },
    {
      type: 'put',
      strike: rs(p * 0.88).toString(),
      expiry: 'May 30',
      oi: oi(8500),
      premium: prem(p * 0.005),
      note: 'Expiring soon',
      unusual: false,
    },
  ]
}

export function getMockNews(ticker) {
  const t = ticker.toUpperCase()
  return [
    {
      headline: `${t} shares climb after analyst upgrade; price target raised on strong forward earnings visibility.`,
      sentiment: 'positive',
      source: 'Bloomberg',
      time: '1h ago',
    },
    {
      headline: `Federal Reserve holds rates steady but signals fewer cuts in 2025, pressuring rate-sensitive growth stocks.`,
      sentiment: 'negative',
      source: 'Reuters',
      time: '3h ago',
    },
    {
      headline: `${t} expands its AI-driven product suite with three new enterprise partnerships announced at industry summit.`,
      sentiment: 'positive',
      source: 'WSJ',
      time: '5h ago',
    },
    {
      headline: `Institutional buyers accumulate ${t} shares in recent sessions amid broad sector rotation.`,
      sentiment: 'positive',
      source: "Barron's",
      time: '7h ago',
    },
    {
      headline: `Global macro uncertainty and mixed PMI data keep equity markets in a holding pattern this week.`,
      sentiment: 'neutral',
      source: 'MarketWatch',
      time: '9h ago',
    },
    {
      headline: `${t} faces potential headwinds from renewed supply chain concerns tied to overseas manufacturing exposure.`,
      sentiment: 'negative',
      source: 'FT',
      time: '11h ago',
    },
  ]
}
