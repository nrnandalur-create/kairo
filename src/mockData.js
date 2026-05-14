export const getMockOptions = (ticker) => [
  { type: 'call', strike: '195', expiry: 'Jun 20', oi: '42,300', premium: '$3.40', note: 'Unusual sweep' },
  { type: 'call', strike: '200', expiry: 'Jul 18', oi: '28,100', premium: '$1.85', note: 'High OI buildup' },
  { type: 'put', strike: '180', expiry: 'Jun 20', oi: '19,800', premium: '$2.10', note: 'Protective hedge' },
  { type: 'put', strike: '175', expiry: 'May 30', oi: '11,200', premium: '$0.65', note: 'Expiring soon' },
]

export const getMockNews = (ticker) => [
  { headline: `${ticker} beats Q2 estimates, raises full-year guidance on AI hardware demand.`, sentiment: 'positive', source: 'Bloomberg', time: '2h ago' },
  { headline: `Fed signals rates higher for longer — growth stocks face valuation pressure.`, sentiment: 'negative', source: 'Reuters', time: '4h ago' },
  { headline: `${ticker} partners with three major cloud providers to expand enterprise AI services.`, sentiment: 'positive', source: 'WSJ', time: '6h ago' },
  { headline: `Analyst at Morgan Stanley reiterates Overweight, raises price target to $220.`, sentiment: 'positive', source: "Barron's", time: '8h ago' },
  { headline: `Broad market uncertainty persists as VIX creeps above 18.`, sentiment: 'neutral', source: 'MarketWatch', time: '10h ago' },
]
