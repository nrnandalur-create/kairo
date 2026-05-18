import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FINNHUB_KEY      = Deno.env.get("FINNHUB_API_KEY")!;

async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`,
    );
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.c === "number" && d.c > 0 ? d.c : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (_req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

    // 1. Load every holding across all users in one query
    const { data: allHoldings, error: hErr } = await supabase
      .from("portfolio_holdings")
      .select("user_id, ticker, shares, avg_cost");

    if (hErr) throw hErr;
    if (!allHoldings?.length) return json({ ok: true, processed: 0 });

    // 2. Deduplicate tickers and batch-fetch prices (10 at a time, ~1 req/s to stay
    //    within Finnhub free-tier 60 req/min limit across all users)
    const uniqueTickers = [...new Set(allHoldings.map((h) => h.ticker.toUpperCase()))];
    const prices: Record<string, number | null> = {};

    for (let i = 0; i < uniqueTickers.length; i += 10) {
      const batch = uniqueTickers.slice(i, i + 10);
      const results = await Promise.all(
        batch.map((t) => fetchPrice(t).then((p) => [t, p] as const)),
      );
      results.forEach(([t, p]) => { prices[t] = p; });
      if (i + 10 < uniqueTickers.length) await sleep(1100);
    }

    // 3. Group holdings by user_id
    const byUser = new Map<string, typeof allHoldings>();
    for (const h of allHoldings) {
      const list = byUser.get(h.user_id) ?? [];
      list.push(h);
      byUser.set(h.user_id, list);
    }

    // 4. Calculate totals per user and upsert snapshot
    const today = new Date().toISOString().split("T")[0];
    let processed = 0;
    const skipped: string[] = [];

    for (const [userId, holdings] of byUser) {
      let totalValue = 0;
      let totalCost  = 0;
      let priced     = 0;

      for (const h of holdings) {
        const price = prices[h.ticker.toUpperCase()];
        if (price == null) continue;
        totalValue += price * Number(h.shares);
        totalCost  += Number(h.avg_cost) * Number(h.shares);
        priced++;
      }

      // Skip snapshot if we couldn't price any holding
      if (priced === 0) { skipped.push(userId); continue; }

      const { error: upsertErr } = await supabase
        .from("portfolio_snapshots")
        .upsert(
          {
            user_id:       userId,
            snapshot_date: today,
            total_value:   Math.round(totalValue * 100) / 100,
            total_cost:    Math.round(totalCost  * 100) / 100,
          },
          { onConflict: "user_id,snapshot_date" },
        );

      if (upsertErr) throw upsertErr;
      processed++;
    }

    return json({ ok: true, processed, tickers: uniqueTickers.length, skipped: skipped.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return json({ error: msg }, 500);
  }
});
