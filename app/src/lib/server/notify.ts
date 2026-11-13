import "server-only";
import * as webpush from "web-push";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { timeLeft, type ChainCase } from "@/lib/cases";
import { formatG } from "@/lib/format";
import { dataKey, network } from "@/lib/network";
import { publicClient } from "./chain";
import { appUrl, emailConfigured, sendEmail } from "./email";
import { emailForWallet } from "./privy";
import { db } from "./supabase";

/**
 * Alerts by web push, Telegram and email. Jurors: "You've been drawn" and "Time to reveal". Parties: the other person
 * added their side, a nudge before the invite expires, the verdict, and refunds. Jurors who voted: their pay is ready.
 * Each alert is recorded before sending, so it goes out at most once per wallet per case per kind.
 */
export type AlertKind = "drawn" | "reveal" | "joined" | "nudge" | "verdict" | "refund" | "juror_paid";
type Message = { title: string; body: string; url: string; cta: string };

let vapidReady = false;
function vapid(): boolean {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(appUrl(), pub, priv);
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

function jurorMessage(kind: "drawn" | "reveal", caseId: bigint, deadline: string): Message {
  const url = `/c/${caseId}`;
  return kind === "drawn"
    ? {
        title: "📣 You've been called to a jury",
        body: `Case #${caseId} needs your vote. Vote within ${deadline}: your vote counts and pays.`,
        url,
        cta: "Vote now",
      }
    : {
        title: "⏰ Time to reveal your vote",
        body: `Everyone on case #${caseId} has voted or time is up. Reveal yours within ${deadline} so it counts and you get paid.`,
        url,
        cta: "Reveal now",
      };
}

/** Send one alert to one wallet's owner, via every channel they've turned on. Never throws. */
export async function notifyWallet(kind: AlertKind, caseId: bigint, wallet: string, m: Message): Promise<void> {
  const w = wallet.toLowerCase();
  try {
    const { error: dup } = await db()
      .from("notifications_sent")
      .insert({ network: dataKey, case_id: caseId.toString(), wallet: w, kind });
    if (dup) return; // already sent (or the table isn't there yet)

    const [{ data: subs }, { data: links }, mail] = await Promise.all([
      db().from("push_subscriptions").select("endpoint, privy_user_id, p256dh, auth").contains("wallets", [w]),
      db().from("telegram_links").select("privy_user_id, chat_id").contains("wallets", [w]),
      emailConfigured() ? emailForWallet(w) : Promise.resolve(null),
    ]);
    const users = [
      ...new Set([...(subs ?? []).map((s) => s.privy_user_id), ...(links ?? []).map((l) => l.privy_user_id), ...(mail ? [mail.userId] : [])]),
    ];
    if (users.length === 0) return;
    const { data: prefs } = await db().from("notification_prefs").select("*").in("privy_user_id", users);
    const pref = (u: string) =>
      prefs?.find((p) => p.privy_user_id === u) ?? { push_enabled: true, telegram_enabled: true, email_enabled: true };

    await Promise.all([
      ...(vapid() ? subs ?? [] : [])
        .filter((s) => pref(s.privy_user_id).push_enabled)
        .map((s) =>
          webpush
            .sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: m.title, body: m.body, url: m.url }),
              { TTL: 6 * 3600 },
            )
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
            reply_markup: { inline_keyboard: [[{ text: m.cta, url: appUrl() + m.url }]] },
          }),
        ),
      ...(mail && pref(mail.userId).email_enabled !== false
        ? [
            sendEmail(
              mail.email,
              mail.userId,
              { subject: stripEmoji(m.title), heading: stripEmoji(m.title), body: m.body, cta: m.cta, path: m.url },
              `${dataKey}:${caseId}:${w}:${kind}`,
            ),
          ]
        : []),
    ]);
  } catch {
    // alerts must never break the keeper
  }
}

const stripEmoji = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "").trim();

export async function alertJuror(kind: "drawn" | "reveal", caseId: bigint, wallet: string, deadline: string): Promise<void> {
  return notifyWallet(kind, caseId, wallet, jurorMessage(kind, caseId, deadline));
}

const ZERO = "0x0000000000000000000000000000000000000000";
const NUDGE_BEFORE_SECONDS = 12n * 3600n;

/**
 * Called by the keeper for every case it reads, finished or not. Sends the party and payout alerts that fit the
 * case's current state; the once-per-kind record makes repeat calls harmless.
 */
export async function alertCaseUpdates(caseId: bigint, c: ChainCase, jurors: readonly string[], now: bigint): Promise<void> {
  const url = `/c/${caseId}`;
  const oneSided = c.mode === 1;
  const hasB = c.partyB.toLowerCase() !== ZERO;

  // Two-sided, still waiting on B: nudge A once, shortly before the invite runs out.
  if (c.status === 1 && !oneSided && now < c.joinDeadline && c.joinDeadline - now <= NUDGE_BEFORE_SECONDS) {
    await notifyWallet("nudge", caseId, c.partyA, {
      title: "⏳ Still waiting on them",
      body: `The other person hasn't added their side to case #${caseId} yet. They have ${timeLeft(c.joinDeadline, Number(now))} left, then your fee comes back to you. Send them the invite again?`,
      url,
      cta: "Open the case",
    });
  }

  // B joined (any later state means they did): tell A.
  if (!oneSided && hasB && c.status >= 2) {
    await notifyWallet("joined", caseId, c.partyA, {
      title: "⚖️ They added their side",
      body: `The other person answered case #${caseId}. Next, 5 random jurors are drawn to decide.`,
      url,
      cta: "Read their side",
    });
  }

  if (c.status === 5) {
    const tally = `${Math.max(c.votesA, c.votesB)}–${Math.min(c.votesA, c.votesB)}`;
    if (oneSided) {
      const right = c.verdict === 1;
      await notifyWallet("verdict", caseId, c.partyA, {
        title: right ? "✅ The jury says you're right" : "❌ The jury says you're wrong",
        body: `The jury voted ${tally} on case #${caseId}. See how they voted and what people said.`,
        url,
        cta: "See the verdict",
      });
    } else {
      for (const [party, side] of [[c.partyA, 1], [c.partyB, 2]] as const) {
        const won = c.verdict === side;
        await notifyWallet("verdict", caseId, party, {
          title: won ? "🏆 The jury sided with you" : "The jury sided with them",
          body: `The jury voted ${tally} on case #${caseId}. See how they voted and what people said.`,
          url,
          cta: "See the verdict",
        });
      }
    }
    // Jurors who revealed share the whole pot.
    const pot = c.depositA + c.depositB;
    if (c.reveals > 0 && jurors.length > 0) {
      const votes = await jurorVotes(caseId, jurors);
      const share = formatG(pot / BigInt(c.reveals));
      for (let i = 0; i < jurors.length; i++) {
        if (!votes?.[i]?.revealed) continue;
        await notifyWallet("juror_paid", caseId, jurors[i], {
          title: `💰 You earned ${share} ${network.tokenSymbol}`,
          body: `Case #${caseId} is decided and your vote counted. Your share is ready to withdraw to your wallet.`,
          url: "/account",
          cta: "Withdraw",
        });
      }
    }
  }

  if (c.status === 6) {
    for (const [party, deposit] of [[c.partyA, c.depositA], [c.partyB, c.depositB]] as const) {
      if (deposit === 0n || party.toLowerCase() === ZERO) continue;
      await notifyWallet("refund", caseId, party, {
        title: "↩️ Your fee is back",
        body: `Case #${caseId} ended without a verdict, so your ${formatG(deposit)} ${network.tokenSymbol} is refunded. It's ready to withdraw to your wallet.`,
        url: "/account",
        cta: "Withdraw",
      });
    }
  }
}

async function jurorVotes(caseId: bigint, jurors: readonly string[]) {
  return (await publicClient
    .multicall({
      contracts: jurors.map((j) => ({
        address: network.restMyCase!,
        abi: restMyCaseAbi,
        functionName: "getJurorVote" as const,
        args: [caseId, j as `0x${string}`] as const,
      })),
      allowFailure: false,
    })
    .catch(() => null)) as { commitment: string; revealed: boolean }[] | null;
}

/**
 * Called by the keeper for each case in voting. "drawn" to every juror; "reveal" to jurors who committed but haven't
 * revealed, once the reveal stage is open.
 */
export async function alertJurorsFor(caseId: bigint, c: ChainCase, jurors: readonly string[], now: bigint): Promise<void> {
  if (c.status !== 4 || jurors.length === 0 || !network.restMyCase) return;
  const nowSec = Number(now);
  const revealOpen = now > c.commitDeadline || c.commits === jurors.length;
  const votes = revealOpen
    ? await jurorVotes(caseId, jurors)
    : null;
  for (let i = 0; i < jurors.length; i++) {
    if (now <= c.commitDeadline) await alertJuror("drawn", caseId, jurors[i], timeLeft(c.commitDeadline, nowSec));
    const v = votes?.[i];
    if (revealOpen && v && !v.revealed && v.commitment !== `0x${"0".repeat(64)}` && now <= c.revealDeadline) {
      await alertJuror("reveal", caseId, jurors[i], timeLeft(c.revealDeadline, nowSec));
    }
  }
}
