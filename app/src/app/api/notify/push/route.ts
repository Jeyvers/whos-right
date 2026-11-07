import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad } from "@/lib/server/http";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/** Save this device's push subscription (from the browser's PushManager). */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const sub = ((await request.json().catch(() => ({}))) ?? {}) as Sub;
  if (!sub.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return bad("Bad subscription.");
  const { error } = await db().from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      privy_user_id: user.userId,
      wallets: user.wallets.map((w) => w.toLowerCase()),
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) return bad("Couldn't turn on notifications. Try again.", 500);
  await db().from("notification_prefs").upsert({ privy_user_id: user.userId, push_enabled: true }, { onConflict: "privy_user_id" });
  return Response.json({ ok: true });
}

/** Body: { endpoint } — forget this device. */
export async function DELETE(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const { endpoint } = ((await request.json().catch(() => ({}))) ?? {}) as { endpoint?: string };
  if (!endpoint) return bad("Missing endpoint.");
  await db().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("privy_user_id", user.userId);
  return Response.json({ ok: true });
}
