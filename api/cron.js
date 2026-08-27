// Single cron dispatcher — replaces 7 separate /api/cron/* handlers so the
// project stays under Vercel's 12-function Hobby limit.
//
// Each job module exports default async handler(req, res). This file is the
// SINGLE authorization boundary for every job: it requires
// `Authorization: Bearer <CRON_SECRET>` before dispatching. Vercel Cron sends
// exactly this header automatically when the CRON_SECRET env var is set, so the
// scheduled jobs keep working with no vercel.json change. The spoofable
// x-vercel-cron header and the ?secret= query param are NO LONGER trusted.
//
// Scheduled jobs in vercel.json:
//   /api/cron?job=open-brief at 13:30 UTC (08:30 ET) weekdays
//   /api/cron?job=close-wrap at 21:30 UTC (16:30 ET) weekdays
//
// All other jobs ('check-alerts', 'smart-signals', 'conviction-followup',
// 'evaluate-verdicts', 'curate-setups') remain available but only fire on
// demand via an external scheduler that sends the Bearer header:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://kairo-iota-red.vercel.app/api/cron?job=evaluate-verdicts

import { requireCron } from '../lib/auth.js'
import handleCheckAlerts        from '../lib/jobs/checkAlerts.js'
import handleOpenBrief          from '../lib/jobs/openBrief.js'
import handleCloseWrap          from '../lib/jobs/closeWrap.js'
import handleSmartSignals       from '../lib/jobs/smartSignals.js'
import handleConvictionFollowup from '../lib/jobs/convictionFollowup.js'
import handleEvaluateVerdicts   from '../lib/jobs/evaluateVerdicts.js'
import handleCurateSetups       from '../lib/jobs/curateSetups.js'

const JOBS = {
  'check-alerts':        handleCheckAlerts,
  'open-brief':          handleOpenBrief,
  'close-wrap':          handleCloseWrap,
  'smart-signals':       handleSmartSignals,
  'conviction-followup': handleConvictionFollowup,
  'evaluate-verdicts':   handleEvaluateVerdicts,
  'curate-setups':       handleCurateSetups,
}

export default async function handler(req, res) {
  // Authorize EVERY job centrally before doing anything else. Never logs the secret.
  if (!requireCron(req, res)) return

  const job = req.query?.job
  if (!job || !JOBS[job]) {
    return res.status(400).json({
      error: 'Unknown or missing job',
      available: Object.keys(JOBS),
    })
  }
  return JOBS[job](req, res)
}

// Match the longest of the underlying jobs — Groq calls in the brief jobs
// can take 10-20s on cold-start.
export const config = { maxDuration: 60 }
