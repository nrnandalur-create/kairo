import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY    = Deno.env.get("RESEND_API_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function signalColor(s: string) {
  return s === "BUY" ? "#1D9E75" : s === "SELL" ? "#e24b4a" : "#d4922a";
}

function riskColor(r: string) {
  return r === "LOW" ? "#1D9E75" : r === "HIGH" ? "#e24b4a" : "#d4922a";
}

function buildEmail(
  ticker: string,
  signal: string,
  confidence: number,
  entryPrice: number,
  stopLoss: number,
  riskLevel: string,
  prevSignal: string | null,
): string {
  const sc = signalColor(signal);
  const rc = riskColor(riskLevel);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ticker} signal changed to ${signal}</title></head>
<body style="margin:0;padding:0;background:#080c0a;font-family:-apple-system,'Segoe UI',Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080c0a;padding:40px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="padding-bottom:20px;border-bottom:1px solid #1a2e1f;">
      <span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;font-family:Georgia,'Times New Roman',serif;">kairo</span><br>
      <span style="font-size:9px;color:#4b6358;letter-spacing:0.3em;text-transform:uppercase;">Signal Alert</span>
    </td>
  </tr>

  <tr><td height="28"></td></tr>

  <!-- Signal card -->
  <tr>
    <td style="background:#0f1611;border:1px solid #1a2e1f;border-radius:12px;padding:28px;">

      <div style="font-size:10px;color:#4b6358;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:14px;">AI Signal Change</div>

      <!-- Ticker row -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
        <tr>
          <td style="font-size:36px;font-weight:800;color:#ffffff;padding-right:14px;line-height:1;">${ticker}</td>
          <td valign="middle">
            <span style="display:inline-block;background:${sc}18;color:${sc};border:1px solid ${sc}50;padding:7px 16px;border-radius:6px;font-size:15px;font-weight:700;letter-spacing:0.08em;">${signal}</span>
          </td>
        </tr>
      </table>

      ${prevSignal ? `
      <!-- Previous signal context -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">
        <tr>
          <td style="background:#080c0a;border:1px solid #1a2e1f;border-radius:8px;padding:10px 14px;font-size:12px;color:#4b6358;">
            Signal changed: <span style="color:#d1d9d5;font-weight:600;">${prevSignal}</span>
            &nbsp;&#8594;&nbsp;
            <span style="color:${sc};font-weight:600;">${signal}</span>
          </td>
        </tr>
      </table>` : ""}

      <!-- Metrics grid -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="50%" style="padding-right:6px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="background:#080c0a;border:1px solid #1a2e1f;border-radius:8px;padding:14px;">
                <div style="font-size:9px;color:#4b6358;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Confidence</div>
                <div style="font-size:26px;font-weight:800;color:${sc};line-height:1;">${confidence}<span style="font-size:12px;color:#4b6358;font-weight:400;">/100</span></div>
              </td></tr>
            </table>
          </td>
          <td width="50%" style="padding-left:6px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="background:#080c0a;border:1px solid #1a2e1f;border-radius:8px;padding:14px;">
                <div style="font-size:9px;color:#4b6358;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Risk Level</div>
                <div style="font-size:26px;font-weight:800;color:${rc};line-height:1;">${riskLevel}</div>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr><td height="10" colspan="2"></td></tr>
        <tr>
          <td width="50%" style="padding-right:6px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="background:#080c0a;border:1px solid #1a2e1f;border-radius:8px;padding:14px;">
                <div style="font-size:9px;color:#4b6358;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Entry Price</div>
                <div style="font-size:26px;font-weight:800;color:#d1d9d5;line-height:1;">$${Number(entryPrice).toFixed(2)}</div>
              </td></tr>
            </table>
          </td>
          <td width="50%" style="padding-left:6px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="background:#080c0a;border:1px solid #1a2e1f;border-radius:8px;padding:14px;">
                <div style="font-size:9px;color:#4b6358;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">Stop Loss</div>
                <div style="font-size:26px;font-weight:800;color:#e24b4a;line-height:1;">$${Number(stopLoss).toFixed(2)}</div>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <tr><td height="24"></td></tr>

  <!-- CTA -->
  <tr>
    <td align="center">
      <a href="https://kairo.vercel.app" style="display:inline-block;background:#1D9E75;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:13px 32px;border-radius:8px;letter-spacing:0.01em;">Open Kairo &rarr;</a>
    </td>
  </tr>

  <tr><td height="28"></td></tr>

  <!-- Footer -->
  <tr>
    <td style="border-top:1px solid #1a2e1f;padding-top:20px;text-align:center;">
      <span style="font-size:11px;color:#263d2c;line-height:1.7;">
        Kairo is for informational purposes only and does not constitute financial advice.<br>
        You received this because <strong>${ticker}</strong> is in your watchlist.
      </span>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { ticker, signal, confidence, entryPrice, stopLoss, riskLevel } =
      await req.json();

    if (!ticker || !["BUY", "SELL", "HOLD"].includes(signal)) {
      return json({ error: "Invalid payload" }, 400);
    }

    // Fetch last logged signal for this user+ticker
    const { data: lastLog } = await supabase
      .from("ai_signal_log")
      .select("signal")
      .eq("user_id", user.id)
      .eq("ticker", ticker)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevSignal   = lastLog?.signal ?? null;
    const signalChanged = prevSignal !== signal;

    // Insert new log entry
    await supabase.from("ai_signal_log").insert({
      user_id:    user.id,
      ticker:     ticker.toUpperCase(),
      signal,
      confidence,
      entry_price: entryPrice,
      stop_loss:   stopLoss,
      risk_level:  riskLevel,
    });

    // Send email alert when signal changes
    if (signalChanged && user.email && RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from:    "Kairo Alerts <onboarding@resend.dev>",
          to:      user.email,
          subject: `${ticker.toUpperCase()} signal changed to ${signal} — Kairo`,
          html:    buildEmail(ticker.toUpperCase(), signal, confidence, entryPrice, stopLoss, riskLevel, prevSignal),
        }),
      });
    }

    return json({ ok: true, signalChanged, prevSignal });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return json({ error: msg }, 500);
  }
});
