// One serverless function serves every billing surface — keeps us under the
// Vercel Hobby 12-function cap. Sub-actions via ?action= query string:
//   ?action=checkout — create a Stripe Checkout Session (POST)
//   ?action=portal   — create a Stripe Customer Portal link (POST)
//   ?action=status   — return the caller's subscription row (GET)
//   ?action=webhook  — signature-verified Stripe event handler (POST)
//
// Stripe webhooks require the RAW request body for signature verification.
// Vercel serverless auto-parses JSON bodies, so we disable bodyParser at the
// function level and manually read the raw stream. Non-webhook actions parse
// that raw text as JSON before use.

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Vercel: raw body access requires disabling the built-in JSON parser.
export const config = {
  api: { bodyParser: false },
  maxDuration: 25,
}

// ── Config ──────────────────────────────────────────────────────────────────
const STRIPE_SECRET     = process.env.STRIPE_SECRET_KEY
const WEBHOOK_SECRET    = process.env.STRIPE_WEBHOOK_SECRET
const PRICE_MONTHLY     = process.env.STRIPE_PRICE_MONTHLY
const PRICE_ANNUAL      = process.env.STRIPE_PRICE_ANNUAL
const SUPABASE_URL      = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

// Public URL where the app is deployed. Used for Stripe success/cancel/return
// URLs. Falls back to the request host when unset so local dev still works.
function siteUrlFor(req) {
  const configured = process.env.PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const proto = req.headers['x-forwarded-proto'] ?? 'https'
  const host  = req.headers['x-forwarded-host'] ?? req.headers.host
  return `${proto}://${host}`
}

const stripe = STRIPE_SECRET
  ? new Stripe(STRIPE_SECRET, { apiVersion: '2024-06-20' })
  : null

// Service-role client bypasses RLS — required because the webhook updates
// arbitrary users. Never expose this key to the browser.
const supabaseAdmin = SUPABASE_URL && SUPABASE_SVC_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SVC_KEY, { auth: { persistSession: false } })
  : null

// ── Raw-body reader ─────────────────────────────────────────────────────────
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end',  () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// ── Helper: identify caller via Supabase JWT in Authorization header ────────
async function requireUser(req, res) {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token || !supabaseAdmin) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  return data.user
}

// ── Ensure the user has a subscription row (defaults to 'free') ─────────────
async function ensureSubscriptionRow(user) {
  const { data: existing } = await supabaseAdmin
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing) return existing
  const { data: created, error } = await supabaseAdmin
    .from('user_subscriptions')
    .insert({ user_id: user.id, subscription_status: 'free' })
    .select()
    .single()
  if (error) throw error
  return created
}

// ── Reuse existing Stripe customer or create one ────────────────────────────
async function getOrCreateStripeCustomer(user, row) {
  if (row?.stripe_customer_id) return row.stripe_customer_id
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { supabase_user_id: user.id },
  })
  await supabaseAdmin
    .from('user_subscriptions')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  return customer.id
}

// ── Action: checkout ────────────────────────────────────────────────────────
async function actionCheckout(req, res, rawBody) {
  if (!stripe)         return res.status(500).json({ error: 'Stripe not configured' })
  if (!supabaseAdmin)  return res.status(500).json({ error: 'Supabase admin not configured' })

  const user = await requireUser(req, res); if (!user) return

  let body = {}
  try { body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {} }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }) }

  const interval = body.interval === 'annual' ? 'annual' : 'monthly'
  const priceId  = interval === 'annual' ? PRICE_ANNUAL : PRICE_MONTHLY
  if (!priceId) return res.status(500).json({ error: 'Price ID not configured' })

  const row        = await ensureSubscriptionRow(user)
  const customerId = await getOrCreateStripeCustomer(user, row)
  const site       = siteUrlFor(req)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${site}/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${site}/pricing?checkout=cancelled`,
    subscription_data: { metadata: { supabase_user_id: user.id } },
    metadata: { supabase_user_id: user.id, interval },
  })

  return res.status(200).json({ url: session.url, id: session.id })
}

// ── Action: portal ──────────────────────────────────────────────────────────
async function actionPortal(req, res) {
  if (!stripe)        return res.status(500).json({ error: 'Stripe not configured' })
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase admin not configured' })

  const user = await requireUser(req, res); if (!user) return
  const row  = await ensureSubscriptionRow(user)
  if (!row.stripe_customer_id) {
    return res.status(400).json({ error: 'No active subscription found' })
  }
  const site = siteUrlFor(req)
  const portal = await stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${site}/account/billing`,
  })
  return res.status(200).json({ url: portal.url })
}

// ── Action: status ──────────────────────────────────────────────────────────
async function actionStatus(req, res) {
  if (!supabaseAdmin) return res.status(500).json({ error: 'Supabase admin not configured' })
  const user = await requireUser(req, res); if (!user) return
  const row = await ensureSubscriptionRow(user)
  return res.status(200).json({
    subscriptionStatus: row.subscription_status,
    currentPeriodEnd:   row.current_period_end,
    gracePeriodEnd:     row.grace_period_end,
    hasStripeCustomer:  !!row.stripe_customer_id,
  })
}

// ── Action: webhook ─────────────────────────────────────────────────────────
async function actionWebhook(req, res, rawBody) {
  if (!stripe)         return res.status(500).send('Stripe not configured')
  if (!WEBHOOK_SECRET) return res.status(500).send('Webhook secret not configured')
  if (!supabaseAdmin)  return res.status(500).send('Supabase admin not configured')

  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(400).send('Missing stripe-signature header')

  let event
  try {
    // constructEvent throws if the signature is invalid or the payload was
    // tampered with. Never skip this — it's the only trust boundary between
    // us and arbitrary POST callers.
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET)
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId  = session.metadata?.supabase_user_id
        const subId   = session.subscription
        if (!userId) break

        let periodEnd = null
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId)
          periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null
          await supabaseAdmin
            .from('user_subscriptions')
            .update({
              subscription_status:    'active',
              stripe_customer_id:     session.customer,
              stripe_subscription_id: subId,
              current_period_end:     periodEnd,
              grace_period_end:       null,
              updated_at:             new Date().toISOString(),
            })
            .eq('user_id', userId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub    = event.data.object
        const userId = sub.metadata?.supabase_user_id
        if (!userId) break

        // Stripe status values: active, past_due, canceled, unpaid, trialing,
        // incomplete, incomplete_expired. Map to our four-state enum.
        const rawStatus = sub.status
        const mapped =
          rawStatus === 'active' || rawStatus === 'trialing' ? 'active'   :
          rawStatus === 'past_due' || rawStatus === 'unpaid' ? 'past_due' :
          rawStatus === 'canceled' || rawStatus === 'incomplete_expired' ? 'canceled' :
          'free'

        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            subscription_status:    mapped,
            stripe_subscription_id: sub.id,
            current_period_end:     sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
        break
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object
        const userId = sub.metadata?.supabase_user_id
        if (!userId) break
        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            subscription_status: 'free',
            current_period_end:  null,
            grace_period_end:    null,
            updated_at:          new Date().toISOString(),
          })
          .eq('user_id', userId)
        break
      }

      case 'invoice.payment_failed': {
        // Mark past_due but grant a 3-day grace window before feature gating
        // treats the user as free again. The client's useSubscription hook
        // reads grace_period_end and keeps isPro=true until that timestamp.
        const invoice = event.data.object
        const subId   = invoice.subscription
        if (!subId) break
        const sub     = await stripe.subscriptions.retrieve(subId)
        const userId  = sub.metadata?.supabase_user_id
        if (!userId) break

        const graceEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        await supabaseAdmin
          .from('user_subscriptions')
          .update({
            subscription_status: 'past_due',
            grace_period_end:    graceEnd,
            updated_at:          new Date().toISOString(),
          })
          .eq('user_id', userId)
        break
      }

      default:
        // Ignore other event types — return 200 so Stripe doesn't retry.
        break
    }
    return res.status(200).json({ received: true })
  } catch (err) {
    // Signature was valid but processing failed. Return 500 so Stripe retries.
    return res.status(500).json({ error: err.message ?? 'Webhook handler failed' })
  }
}

// ── Router ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const action = req.query.action

  // GET status — no body to read
  if (action === 'status' && req.method === 'GET') return actionStatus(req, res)

  // Everything else is POST + needs raw body (either for JSON parse or Stripe
  // signature verification).
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const rawBody = await readRawBody(req)

  switch (action) {
    case 'checkout': return actionCheckout(req, res, rawBody)
    case 'portal':   return actionPortal(req, res)
    case 'webhook':  return actionWebhook(req, res, rawBody)
    default:         return res.status(400).json({ error: 'Unknown action' })
  }
}
