import "server-only";
import * as webpush from "web-push";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { timeLeft, type ChainCase } from "@/lib/cases";
import { dataKey, network } from "@/lib/network";
import { publicClient } from "./chain";
import { db } from "./supabase";

/**
 * Juror alerts: "You've been drawn" and "Time to reveal", by web push and Telegram (email comes later, once there's a
 * sending domain). Each alert is recorded before sending, so it goes out at most once per juror per case.
 */
export type AlertKind = "drawn" | "reveal";

let vapidReady = false;
function vapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("https://whos-right-nine.vercel.app", pub, priv);
  vapidReady = true;
  return true;
}

export async function telegram(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return res ? res.json().catch(() => ({ ok: false })) : { ok: false };
}

function messageFor(kind: AlertKind, caseId: bigint, deadline: string) {
  const url = `/c/${caseId}`;
  return kind === "drawn"
    ? {
        title: "📣 You've been called to a jury",
        body: `Case #${caseId} needs your vote. Vote within ${deadline}: your vote counts and pays.`,
        url,
      }
    : {
        title: "⏰ Time to reveal your vote",
        body: `Everyone on case #${caseId} has voted or time is up. Reveal yours within ${deadline} so it counts and you get paid.`,
        url,
      };
}

/** Send one alert to one juror wallet, via every channel they've turned on. Never throws. */
export async function alertJuror(kind: AlertKind, caseId: bigint, wallet: string, deadline: string): Promise<void> {
  const w = wallet.toLowerCase();
  try {
    const { error: dup } = await db()
      .from("notifications_sent")
      .insert({ network: dataKey, case_id: caseId.toString(), wallet: w, kind });
    if (dup) return; // already sent (or the table isn't there yet)

    const [{ data: subs }, { data: links }] = await Promise.all([
      db().from("push_subscriptions").select("endpoint, privy_user_id, p256dh, auth").contains("wallets", [w]),
      db().from("telegram_links").select("privy_user_id, chat_id").contains("wallets", [w]),
    ]);
    const users = [...new Set([...(subs ?? []).map((s) => s.privy_user_id), ...(links ?? []).map((l) => l.privy_user_id)])];
    if (users.length === 0) return;
    const { data: prefs } = await db().from("notification_prefs").select("*").in("privy_user_id", users);
    const pref = (u: string) => prefs?.find((p) => p.privy_user_id === u) ?? { push_enabled: true, telegram_enabled: true };

    const m = messageFor(kind, caseId, deadline);
    const appUrl = process.env.APP_URL ?? "https://whos-right-nine.vercel.app";
    await Promise.all([
      ...(vapid() ? subs ?? [] : [])
        .filter((s) => pref(s.privy_user_id).push_enabled)
        .map((s) =>
          webpush
            .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 6 * 3600 })
            .catch(async (e: { statusCode?: number }) => {
              // Gone or invalid: the browser unsubscribed; forget it.
              if (e?.statusCode === 404 || e?.statusCode === 410) await db().from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            }),
        ),
      ...(links ?? [])
        .filter((l) => pref(l.privy_user_id).telegram_enabled)
        .map((l) =>
          telegram("sendMessage", {
            chat_id: l.chat_id,
            text: `${m.title}\n\n${m.body}`,
            reply_markup: { inline_keyboard: [[{ text: kind === "drawn" ? "Vote now" : "Reveal now", url: appUrl + m.url }]] },
          }),
        ),
    ]);
  } catch {
    // alerts must never break the keeper
  }
}

/**
 * Called by the keeper for each case in voting. "drawn" to every juror; "reveal" to jurors who committed but haven't
 * revealed, once the reveal stage is open.
 */
export async function alertJurorsFor(caseId: bigint, c: ChainCase, jurors: readonly string[], now: bigint): Promise<void> {
  if (c.status !== 4 || jurors.length === 0 || !network.whosRight) return;
  const nowSec = Number(now);
  const revealOpen = now > c.commitDeadline || c.commits === jurors.length;
  const votes = revealOpen
    ? ((await publicClient
        .multicall({
          contracts: jurors.map((j) => ({
            address: network.whosRight!,
            abi: whosRightAbi,
            functionName: "getJurorVote" as const,
            args: [caseId, j as `0x${string}`] as const,
          })),
          allowFailure: false,
        })
        .catch(() => null)) as { commitment: string; revealed: boolean }[] | null)
    : null;
  for (let i = 0; i < jurors.length; i++) {
    if (now <= c.commitDeadline) await alertJuror("drawn", caseId, jurors[i], timeLeft(c.commitDeadline, nowSec));
    const v = votes?.[i];
    if (revealOpen && v && !v.revealed && v.commitment !== `0x${"0".repeat(64)}` && now <= c.revealDeadline) {
      await alertJuror("reveal", caseId, jurors[i], timeLeft(c.revealDeadline, nowSec));
    }
  }
}
