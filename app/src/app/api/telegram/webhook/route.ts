import { timingSafeEqual } from "node:crypto";
import { telegram } from "@/lib/server/notify";
import { db } from "@/lib/server/supabase";

/**
 * Telegram bot webhook (set with setWebhook + secret_token). Handles:
 *   /start <code>  — links this chat to the person who made the code (one tap from the app)
 *   /stop          — unlinks
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response(null, { status: 401 });
  }
  const update = (await request.json().catch(() => null)) as { message?: { text?: string; chat?: { id: number; type?: string } } } | null;
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").trim();
  if (!chatId || msg?.chat?.type !== "private") return Response.json({ ok: true });

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1] ?? "";
    if (!/^[0-9a-f]{24}$/.test(code)) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Hi! To get jury alerts, open Rest My Case → Account → Telegram → Connect.",
      });
      return Response.json({ ok: true });
    }
    const { data: row } = await db().from("telegram_link_codes").select("*").eq("code", code).maybeSingle();
    await db().from("telegram_link_codes").delete().eq("code", code);
    if (!row || new Date(row.expires_at) < new Date()) {
      await telegram("sendMessage", { chat_id: chatId, text: "That link expired. Tap Connect in the app again." });
      return Response.json({ ok: true });
    }
    await db()
      .from("telegram_links")
      .upsert({ privy_user_id: row.privy_user_id, chat_id: String(chatId), wallets: row.wallets, linked_at: new Date().toISOString() }, { onConflict: "privy_user_id" });
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "✅ Connected! You'll get a message here when you're drawn for a jury, and when it's time to reveal your vote.\n\nSend /stop any time to turn this off.",
    });
  } else if (text === "/stop") {
    await db().from("telegram_links").delete().eq("chat_id", String(chatId));
    await telegram("sendMessage", { chat_id: chatId, text: "Stopped. You won't get jury alerts here any more." });
  }
  return Response.json({ ok: true });
}
