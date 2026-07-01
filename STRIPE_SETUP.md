# Kairo Pro billing setup

Everything you need to point Stripe + Supabase at the app. Follow in order.

## 1. Supabase migration

Run the SQL in `supabase/migrations/20260701_user_subscriptions.sql` against your
Supabase project (SQL editor → paste → Run). It creates `public.user_subscriptions`
plus the RLS policies and the `updated_at` trigger.

## 2. Stripe dashboard

1. **Create the product.** Products → New product → *"Kairo Pro"*.
2. **Add two prices under that product:**
   - **Monthly** — Recurring, $12.99 USD, billed monthly. Copy the price ID (starts with `price_...`).
   - **Annual** — Recurring, $119 USD, billed yearly. Copy that price ID too.
3. **Enable the Customer Portal.**
   Settings → Billing → Customer portal → *Activate*. Allow:
   cancel, pause (optional), update payment method, invoice history.
   Set the return URL to `https://YOUR-DOMAIN/account/billing`.
4. **Create the webhook endpoint.**
   Developers → Webhooks → *Add endpoint*.
   Endpoint URL: `https://YOUR-DOMAIN/api/stripe?action=webhook`
   Listen for these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   Copy the signing secret (starts with `whsec_...`).

## 3. Vercel environment variables

Add every variable below to Project Settings → Environment Variables.
Set them for **Production, Preview, and Development** environments unless
noted otherwise.

| Variable | Where it comes from | Example / notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys → *Secret key* (starts with `sk_live_` or `sk_test_`) | `sk_live_xxxxx…` |
| `STRIPE_WEBHOOK_SECRET` | The signing secret from step 2.4 above | `whsec_xxxxx…` |
| `STRIPE_PRICE_MONTHLY` | Monthly price ID from step 2.2 | `price_1PxxxxMonthly` |
| `STRIPE_PRICE_ANNUAL` | Annual price ID from step 2.2 | `price_1PxxxxAnnual` |
| `SUPABASE_URL` | Supabase project settings → API → *Project URL* | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API → **service_role** key (NOT anon key) | `eyJhbGciOi…` — server-only, never expose to browser |
| `PUBLIC_SITE_URL` *(optional)* | The domain the app is hosted at, used for Stripe redirect URLs | `https://kairo-iota-red.vercel.app` — if omitted, the app derives it from the request headers |

You also need the existing browser-facing keys (already in your Vercel env, no
changes needed):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase auth client
- `STRIPE_PUBLISHABLE_KEY` — **not currently required** by this integration because
  Checkout is server-initiated. Add it later if you switch to Elements or the
  in-page Payment Element.

## 4. Deploy

`git push` triggers a new Vercel build. Verify:

1. `GET  /pricing` — the pricing page renders with the monthly/annual toggle
2. `GET  /account/billing` — after sign-in, the billing card renders
3. `POST /api/stripe?action=status` with a valid Supabase JWT returns
   `{ subscriptionStatus: 'free', ... }`

## 5. Test the full flow

Use Stripe's test mode + a test card (`4242 4242 4242 4242`, any future expiry, any CVC):

1. Sign in with a Supabase account.
2. Go to `/pricing`, pick monthly, click Upgrade.
3. Complete Stripe Checkout.
4. Stripe redirects to `/account/billing?checkout=success&session_id=…`.
5. Verify the row in `user_subscriptions` for that user now has
   `subscription_status='active'` and a `current_period_end` in the future.
6. Reload the app — the `PRO` chip appears in the header and the gated
   panels are unlocked.
7. Click *Manage subscription* → Stripe Customer Portal → *Cancel*.
8. Confirm the webhook fires; the row moves to `canceled` with
   `current_period_end` unchanged, so access lasts until that date.

## Developer override

The email `nrnandalur@gmail.com` is hard-coded to always receive Pro
entitlements. This override runs at the top of `src/hooks/useSubscription.js`
before any Stripe / Supabase logic and is independent of billing state.
Do not remove it in future refactors — a large comment above it explains why.

## Function-count note

Kairo runs on Vercel Hobby which caps at 12 serverless functions. The
billing integration adds only `api/stripe.js` (one function, four
sub-actions via `?action=`). To make room, `api/analyze-followup.js` was
consolidated into `api/analyze.js` with a `?type=followup` branch.
