export const getMockData = (ticker) => ({
  metrics: {
    price: '$189.84',
    change: '+2.43 (+1.30%)',
    marketCap: '$2.94T',
    pe: '31.2',
    ivRank: '42',
    volume: '58.3M',
  },
  analysis: {
    verdict: 'bullish',
    summary: `${ticker} is showing strong momentum following better-than-expected earnings. The stock broke above its 50-day moving average with elevated volume, suggesting institutional accumulation. Near-term upside looks favored, though overbought RSI conditions warrant caution.`,
    bullCase: 'Earnings beat, strong guidance, AI product revenue accelerating.',
    bearCase: 'Premium valuation, macro headwinds, options market pricing in risk.',
  },
  patterns: [
    {
      name: 'Bullish Engulfing',
      signal: 'bullish',
      explanation: 'A large green candle fully engulfs the prior red candle, signaling a potential reversal from sellers to buyers.',
      timeframe: 'Daily · Detected 1 day ago',
    },
    {
      name: 'Three White Soldiers',
      signal: 'bullish',
      explanation: 'Three consecutive strong green candles with little to no wicks, indicating sustained buying pressure.',
      timeframe: 'Daily · Detected today',
    },
    {
      name: 'Doji Star',
      signal: 'neutral',
      explanation: 'Indecision candle near resistance. Market is pausing — watch for confirmation in either direction.',
      timeframe: '4H · Detected 2 hours ago',
    },
    {
      name: 'Evening Star',
      signal: 'bearish',
      explanation: 'Three-candle reversal pattern on the weekly chart — a warning sign if weekly close confirms.',
      timeframe: 'Weekly · Pending confirmation',
    },
  ],
  options: [
    { type: 'call', strike: '195', expiry: 'Jun 20', oi: '42,300', premium: '$3.40', note: 'Unusual sweep' },
    { type: 'call', strike: '200', expiry: 'Jul 18', oi: '28,100', premium: '$1.85', note: 'High OI buildup' },
    { type: 'put', strike: '180', expiry: 'Jun 20', oi: '19,800', premium: '$2.10', note: 'Protective hedge' },
    { type: 'put', strike: '175', expiry: 'May 30', oi: '11,200', premium: '$0.65', note: 'Expiring soon' },
  ],
  news: [
    {
      headline: `${ticker} smashes Q2 estimates, raises full-year guidance on AI hardware demand.`,
      sentiment: 'positive',
      source: 'Bloomberg',
      time: '2h ago',
    },
    {
      headline: `Fed signals rates higher for longer — growth stocks face valuation pressure.`,
      sentiment: 'negative',
      source: 'Reuters',
      time: '4h ago',
    },
    {
      headline: `${ticker} partners with three major cloud providers to expand enterprise AI services.`,
      sentiment: 'positive',
      source: 'WSJ',
      time: '6h ago',
    },
    {
      headline: `Analyst at Morgan Stanley reiterates Overweight, raises PT to $220.`,
      sentiment: 'positive',
      source: 'Barron\'s',
      time: '8h ago',
    },
    {
      headline: `Broad market uncertainty persists as VIX creeps above 18.`,
      sentiment: 'neutral',
      source: 'MarketWatch',
      time: '10h ago',
    },
  ],
})
