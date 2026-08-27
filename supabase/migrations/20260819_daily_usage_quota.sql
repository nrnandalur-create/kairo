-- Durable, server-authoritative free-tier usage tracking.
--
-- Replaces the client-only localStorage quota (which any user can reset) with a
-- Postgres row per (user, UTC day). The browser may still keep a localStorage
-- copy for optimistic display, but THIS table is the source of truth.
--
-- Quotas enforced (free tier only — Pro bypasses in application code):
--   * 5 unique ticker "searches" per UTC day  (repeat tickers count once)
--   * 1 AI verdict per UTC day
--
-- Consumption goes exclusively through consume_analyze_quota() so the
-- check-and-increment is atomic and two simultaneous requests cannot both slip
-- under the limit.

create table if not exists public.daily_usage (
  user_id           uuid   not null references auth.users(id) on delete cascade,

  -- UTC calendar day. Paired with user_id as the primary key so each user has
  -- exactly one row per day; it resets naturally at UTC midnight because a new
  -- day is simply a new key.
  usage_date        date   not null,

  -- Distinct tickers the user ran AI analysis on today. Uniqueness is enforced
  -- inside consume_analyze_quota (array membership test), so repeated AAPL
  -- searches only ever occupy one slot.
  searched_tickers  text[] not null default '{}',

  -- AI verdicts generated today.
  verdict_count     integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  primary key (user_id, usage_date)
);

-- Row Level Security: a user may read their own usage (for optional UI display)
-- but may NEVER write it — all writes flow through the SECURITY DEFINER RPC
-- invoked by the service-role server. Service-role bypasses RLS anyway.
alter table public.daily_usage enable row level security;

drop policy if exists daily_usage_select_own on public.daily_usage;
create policy daily_usage_select_own
  on public.daily_usage
  for select
  using (auth.uid() = user_id);

drop policy if exists daily_usage_no_client_write on public.daily_usage;
create policy daily_usage_no_client_write
  on public.daily_usage
  for all
  using (false)
  with check (false);

-- ── Atomic quota consumption ────────────────────────────────────────────────
-- Modes:
--   'verdict'  -> records the ticker as a search (cap 5) AND consumes a verdict
--                 (cap 1). Denied on whichever limit binds first.
--   'analysis' -> records the ticker as a search (cap 5). No verdict consumed.
--   'followup' -> consumes a verdict (cap 1). No ticker recorded.
--   'compare'  -> consumes a verdict (cap 1). No ticker recorded.
--
-- Returns jsonb: { allowed: bool, quota: 'search'|'verdict', limit: int, remaining: int }
--
-- Atomicity: the row is materialised (INSERT .. ON CONFLICT DO NOTHING) then
-- locked (SELECT .. FOR UPDATE) for the duration of the transaction, so
-- concurrent calls for the same (user, day) serialise and cannot both consume
-- the last unit.
create or replace function public.consume_analyze_quota(
  p_user   uuid,
  p_date   date,
  p_mode   text,
  p_ticker text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search_limit  constant integer := 5;
  v_verdict_limit constant integer := 1;
  v_searches      text[];
  v_verdicts      integer;
  v_is_new_ticker boolean;
  v_ticker        text := upper(coalesce(p_ticker, ''));
begin
  -- Ensure the row exists, then take a row lock for the rest of the txn.
  insert into public.daily_usage (user_id, usage_date)
  values (p_user, p_date)
  on conflict (user_id, usage_date) do nothing;

  select searched_tickers, verdict_count
    into v_searches, v_verdicts
    from public.daily_usage
   where user_id = p_user and usage_date = p_date
   for update;

  v_is_new_ticker := v_ticker <> '' and not (v_ticker = any(v_searches));

  if p_mode = 'analysis' then
    -- Search-cap only.
    if v_is_new_ticker and cardinality(v_searches) >= v_search_limit then
      return jsonb_build_object('allowed', false, 'quota', 'search',
                                'limit', v_search_limit, 'remaining', 0);
    end if;
    if v_is_new_ticker then
      update public.daily_usage
         set searched_tickers = array_append(searched_tickers, v_ticker),
             updated_at = now()
       where user_id = p_user and usage_date = p_date;
      v_searches := array_append(v_searches, v_ticker);
    end if;
    return jsonb_build_object('allowed', true, 'quota', 'search',
                              'limit', v_search_limit,
                              'remaining', greatest(0, v_search_limit - cardinality(v_searches)));

  elsif p_mode = 'verdict' then
    -- Search-cap binds first, then verdict-cap.
    if v_is_new_ticker and cardinality(v_searches) >= v_search_limit then
      return jsonb_build_object('allowed', false, 'quota', 'search',
                                'limit', v_search_limit, 'remaining', 0);
    end if;
    if v_verdicts >= v_verdict_limit then
      return jsonb_build_object('allowed', false, 'quota', 'verdict',
                                'limit', v_verdict_limit, 'remaining', 0);
    end if;
    update public.daily_usage
       set searched_tickers = case when v_is_new_ticker
                                    then array_append(searched_tickers, v_ticker)
                                    else searched_tickers end,
           verdict_count = verdict_count + 1,
           updated_at = now()
     where user_id = p_user and usage_date = p_date;
    return jsonb_build_object('allowed', true, 'quota', 'verdict',
                              'limit', v_verdict_limit,
                              'remaining', greatest(0, v_verdict_limit - (v_verdicts + 1)));

  elsif p_mode in ('followup', 'compare') then
    -- Verdict-cap only.
    if v_verdicts >= v_verdict_limit then
      return jsonb_build_object('allowed', false, 'quota', 'verdict',
                                'limit', v_verdict_limit, 'remaining', 0);
    end if;
    update public.daily_usage
       set verdict_count = verdict_count + 1,
           updated_at = now()
     where user_id = p_user and usage_date = p_date;
    return jsonb_build_object('allowed', true, 'quota', 'verdict',
                              'limit', v_verdict_limit,
                              'remaining', greatest(0, v_verdict_limit - (v_verdicts + 1)));
  end if;

  -- Unknown mode: fail closed.
  return jsonb_build_object('allowed', false, 'quota', 'unknown', 'limit', 0, 'remaining', 0);
end;
$$;

-- Only the service-role server may consume quota. The browser must never call
-- this directly (it would let a user forge their own usage).
revoke all on function public.consume_analyze_quota(uuid, date, text, text) from public;
revoke all on function public.consume_analyze_quota(uuid, date, text, text) from anon;
revoke all on function public.consume_analyze_quota(uuid, date, text, text) from authenticated;
grant execute on function public.consume_analyze_quota(uuid, date, text, text) to service_role;
