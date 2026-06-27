// Public read-only endpoint for the Setup Feed. Returns today's curated
// setups, or the most recent date if today's haven't been generated yet.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SVC_KEY) return res.status(500).json({ error: 'Service not configured' })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

  // Most recent setup date in the table (any one row tells us).
  const { data: latest } = await supabase
    .from('setups')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) return res.json({ date: null, setups: [] })

  const { data: setups, error } = await supabase
    .from('setups')
    .select('ticker, kind, thesis, score, change_pct, price')
    .eq('date', latest.date)
    .order('score', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600')
  res.json({ date: latest.date, setups: setups ?? [] })
}
