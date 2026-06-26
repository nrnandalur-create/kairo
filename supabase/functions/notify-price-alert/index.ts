import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const CRON_SECRET      = Deno.env.get("CRON_SECRET");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Plain-text-fallback HTML email — matches the visual language of
// signal-alert so the user's inbox feels cohesive.
function buildEmail(
  ticker: string,
  direction: "above" | "below",
  threshold: number,
  currentPrice: number,
) {
  const arrow = direction === "above" ? "▲" : "▼";
  const color = direction === "above" ? "#22B585" : "#ef5454";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ticker} crossed ${direction} $${threshold}</title></head>
<body style="margin:0;padding:0;background:#080c0a;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080c0a;padding:40px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
  <tr><td style="padding-bottom:20px;border-bottom:1px solid #1a2e1f;">
    <span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-family:Georgia,'Times New Roman',serif;">kairo</span><br>
    <span style="font-size:9px;color:#4b6358;letter-spacing:0.3em;text-transform:uppercase;">Price Alert</span>
  </td></tr>
  <tr><td height="28"></td></tr>
  <tr><td style="background:#0f1611;border:1px solid #1a2e1f;border-radius:12px;padding:28px;">
    <div style="font-size:10px;color:#4b6358;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:14px;">Threshold Crossed</div>
    <div style="font-size:36px;font-weight:800;color:#ffffff;line-height:1;margin-bottom:18px;">${ticker}</div>
    <div style="background:#080c0a;border:1px solid #1a2e1f;border-radius:8px;padding:18px;">
      <div style="font-size:13px;color:#d1d9d5;line-height:1.6;">
        <span style="color:${color};font-weight:700;">${arrow} ${ticker}</span> crossed <strong>${direction}</strong> your alert of
        <strong style="color:#d1d9d5;">$${Number(threshold).toFixed(2)}</strong>.
      </div>
      <div style="margin-top:14px;font-size:24px;font-weight:800;color:${color};line-height:1;">
        $${Number(currentPrice).toFixed(2)}
      </div>
      <div style="margin-top:4px;font-size:11px;color:#4b6358;letter-spacing:0.06em;text-transform:uppercase;">
        Current Price
      </div>
    </div>
  </td></tr>
  <tr><td height="24"></td></tr>
  <tr><td align="center">
    <a href="https://kairo-iota-red.vercel.app/t/${ticker}" style="display:inline-block;background:#22B585;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:13px 32px;border-radius:8px;letter-spacing:0.01em;">Open ${ticker} in Kairo &rarr;</a>
  </td></tr>
  <tr><td height="28"></td></tr>
  <tr><td style="border-top:1px solid #1a2e1f;padding-top:20px;text-align:center;">
    <span style="font-size:11px;color:#263d2c;line-height:1.7;">
      Kairo is for informational purposes only and does not constitute financial advice.<br>
      You received this because <strong>${ticker}</strong> is in your watchlist with email alerts enabled.
    </span>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  try {
    // Cron job authenticates with a shared secret header; signed-in users
    // (manual test path) authenticate with their session JWT.
    const cronHeader = req.headers.get("x-cron-secret");
    const authHeader = req.headers.get("Authorization");
    const isCron     = !!CRON_SECRET && cronHeader === CRON_SECRET;

    if (!isCron && !authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

    const { watchlistId, ticker, direction, threshold, currentPrice, email } =
      await req.json();

    if (!ticker || !["above", "below"].includes(direction)) {
      return json({ error: "Invalid payload" }, 400);
    }

    let recipient = email as string | undefined;
    if (!recipient && !isCron) {
      const { data: { user } } = await supabase.auth.getUser(
        (authHeader ?? "").replace("Bearer ", ""),
      );
      recipient = user?.email ?? undefined;
    }
    if (!recipient) return json({ error: "No recipient email" }, 400);

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    "Kairo Alerts <onboarding@resend.dev>",
        to:      recipient,
        subject: `${String(ticker).toUpperCase()} crossed ${direction} $${Number(threshold).toFixed(2)} — Kairo`,
        html:    buildEmail(String(ticker).toUpperCase(), direction, Number(threshold), Number(currentPrice)),
      }),
    });
    if (!sendRes.ok) {
      const errText = await sendRes.text();
      return json({ error: `Resend failed: ${errText}` }, 502);
    }

    // Mark the row so cron debounces re-fires.
    if (watchlistId) {
      await supabase
        .from("watchlists")
        .update({ last_fired_at: new Date().toISOString() })
        .eq("id", watchlistId);
    }

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return json({ error: msg }, 500);
  }
});
