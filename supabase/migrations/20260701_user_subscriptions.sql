-- Stripe billing state for each Supabase auth user.
-- One row per user, created on first billing interaction.
-- The Stripe webhook (service-role client) is the only writer besides the
-- row's initial insert; the browser only reads its own row via RLS.

create table if not exists public.user_subscriptions (
  user_id                 uuid  primary key references auth.users(id) on delete cascade,

  -- Four-state enum kept as text for flexibility.
  --   free      — no active subscription; free tier limits apply
  --   active    — paid, in-period
  --   past_due  — payment failed; hold entitlements until grace_period_end
  --   canceled  — user or Stripe canceled; access ends at current_period_end
  subscription_status     text  not null default 'free'
    check (subscription_status in ('free', 'active', 'canceled', 'past_due')),

  stripe_customer_id      text,
  stripe_subscription_id  text,

  -- Timestamp of the next billing cycle end. NULL while subscription_status='free'.
  current_period_end      timestamptz,

  -- 3-day access grant after a failed payment. Client treats past_due as
  -- still-Pro until now() > grace_period_end.
  grace_period_end        timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Fast lookup by Stripe customer id (used by the webhook to reverse-lookup
-- users when needed).
create index if not exists user_subscriptions_stripe_customer_id_idx
  on public.user_subscriptions (stripe_customer_id);

-- Row Level Security: only the row's owner can read it. All writes come
-- from the service-role client in the webhook handler, which bypasses RLS.
alter table public.user_subscriptions enable row level security;

drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own
  on public.user_subscriptions
  for select
  using (auth.uid() = user_id);

-- Explicitly deny direct client writes so the flow always goes through the
-- webhook. If we ever need client-side edits (rare) we'd add a targeted
-- policy here.
drop policy if exists user_subscriptions_no_client_write on public.user_subscriptions;
create policy user_subscriptions_no_client_write
  on public.user_subscriptions
  for all
  using (false)
  with check (false);

-- Bump updated_at on any change.
create or replace function public.user_subscriptions_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_subscriptions_touch on public.user_subscriptions;
create trigger user_subscriptions_touch
  before update on public.user_subscriptions
  for each row execute function public.user_subscriptions_touch_updated_at();
