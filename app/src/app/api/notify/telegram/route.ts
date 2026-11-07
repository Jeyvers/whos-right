import { randomBytes } from "node:crypto";
import { authenticate } from "@/lib/server/privy";
import { telegram } from "@/lib/server/notify";
import { db } from "@/lib/server/supabase";
import { bad } from "@/lib/server/http";

let botUsername: string | null = null;
async function username(): Promise<string | null> {
  if (botUsername) return botUsername;
  const me = (await telegram("getMe", {})) as { ok: boolean; result?: { username?: string } };
  botUsername = me.ok ? me.result?.username ?? null : null;
  return botUsername;
}

/** One-tap connect: returns a t.me link that opens the bot with a one-time code (valid 15 minutes). */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const bot = await username();
  if (!bot) return bad("Telegram alerts aren't available right now.", 503);
  const code = randomBytes(12).toString("hex");
  const { error } = await db().from("telegram_link_codes").insert({
    code,
    privy_user_id: user.userId,
    wallets: user.wallets.map((w) => w.toLowerCase()),
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  if (error) return bad("Couldn't start the Telegram link. Try again.", 500);
  return Response.json({ url: `https://t.me/${bot}?start=${code}` });
}

/** Disconnect Telegram. */
export async function DELETE(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const { data } = await db().from("telegram_links").select("chat_id").eq("privy_user_id", user.userId).maybeSingle();
  await db().from("telegram_links").delete().eq("privy_user_id", user.userId);
  if (data) await telegram("sendMessage", { chat_id: data.chat_id, text: "Disconnected. You won't get jury alerts here any more." });
  return Response.json({ ok: true });
}
