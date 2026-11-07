import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad } from "@/lib/server/http";

/** Your notification switches, and whether Telegram is connected. */
export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const [{ data: p }, { data: tg }, { count }] = await Promise.all([
    db().from("notification_prefs").select("push_enabled, telegram_enabled").eq("privy_user_id", user.userId).maybeSingle(),
    db().from("telegram_links").select("chat_id").eq("privy_user_id", user.userId).maybeSingle(),
    db().from("push_subscriptions").select("*", { count: "exact", head: true }).eq("privy_user_id", user.userId),
  ]);
  return Response.json({
    pushEnabled: p?.push_enabled ?? true,
    telegramEnabled: p?.telegram_enabled ?? true,
    telegramLinked: Boolean(tg),
    pushDevices: count ?? 0,
  });
}

/** Body: { pushEnabled?, telegramEnabled? } */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const b = ((await request.json().catch(() => ({}))) ?? {}) as { pushEnabled?: unknown; telegramEnabled?: unknown };
  const row: Record<string, unknown> = { privy_user_id: user.userId, updated_at: new Date().toISOString() };
  if (typeof b.pushEnabled === "boolean") row.push_enabled = b.pushEnabled;
  if (typeof b.telegramEnabled === "boolean") row.telegram_enabled = b.telegramEnabled;
  const { error } = await db().from("notification_prefs").upsert(row, { onConflict: "privy_user_id" });
  if (error) return bad("Couldn't save that. Try again.", 500);
  return Response.json({ ok: true });
}
