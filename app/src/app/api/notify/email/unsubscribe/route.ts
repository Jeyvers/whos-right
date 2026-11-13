import { appUrl, validUnsubscribe } from "@/lib/server/email";
import { db } from "@/lib/server/supabase";

/** Turns email alerts off for the signed user id in the link. No sign-in needed: the link itself is the proof. */
async function unsubscribe(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!validUnsubscribe(userId, token)) return false;
  const { error } = await db()
    .from("notification_prefs")
    .upsert({ privy_user_id: userId, email_enabled: false, updated_at: new Date().toISOString() }, { onConflict: "privy_user_id" });
  return !error;
}

function page(ok: boolean) {
  const msg = ok
    ? "Done. You won't get emails from Rest My Case anymore. You can turn them back on in Account."
    : "That link didn't work. You can turn emails off in Account instead.";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email alerts</title></head>
<body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f3efff;color:#1b1035;padding:40px 16px">
<div style="max-width:420px;margin:0 auto;background:#fff;border:3px solid #1b1035;border-radius:20px;padding:24px">
<p style="font-size:18px;font-weight:800;margin:0 0 8px">Email alerts</p><p style="margin:0 0 16px">${msg}</p>
<a href="${appUrl()}/account" style="font-weight:700;color:#3d1e8c">Go to Account</a></div></body></html>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** Opened from the link in an email. */
export async function GET(request: Request) {
  return page(await unsubscribe(request));
}

/** One-click unsubscribe from the mail app (RFC 8058, List-Unsubscribe-Post). */
export async function POST(request: Request) {
  const ok = await unsubscribe(request);
  return new Response(null, { status: ok ? 200 : 400 });
}
