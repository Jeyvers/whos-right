"use client";

import { useState } from "react";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { useNotifications } from "@/hooks/useNotifications";
import { friendlyError } from "@/lib/errors";
import { Spinner } from "./Loading";
import { ErrorNote, Hint, Panel } from "./ui";

function Toggle({ on, busy, onClick, label }: { on: boolean; busy: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className={`relative h-8 w-14 shrink-0 rounded-full border-[3px] border-ink transition-colors ${on ? "bg-side-b" : "bg-white"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-white transition-all ${on ? "left-[26px]" : "left-0.5"}`} />
      {busy && <span className="absolute -right-8 top-0"><Spinner /></span>}
    </button>
  );
}

/** Alerts for jurors and parties. Each channel can be turned off. */
export function NotificationsPanel() {
  const n = useNotifications();
  const { user } = usePrivy();
  const { linkEmail } = useLinkAccount();
  const email = user?.email?.address ?? user?.google?.email ?? null;
  const emailOn = Boolean(email) && n.prefs?.emailEnabled !== false;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(undefined);
    }
  };
  const tgLinked = Boolean(n.prefs?.telegramLinked);
  const tgOn = tgLinked && n.prefs?.telegramEnabled !== false;

  return (
    <Panel>
      <p className="font-display text-xl font-extrabold">Alerts</p>
      <Hint>
        We&apos;ll tell you when you&apos;re drawn for a jury, when it&apos;s time to reveal, when the other person adds
        their side, and when there&apos;s a verdict or money to withdraw.
      </Hint>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">Notifications on this device</p>
          {!n.pushSupported && (
            <p className="text-sm text-ink/60">
              {n.needsHomeScreen
                ? "On iPhone: tap Share → Add to Home Screen, open the app from there, then turn this on."
                : "This browser can't show notifications."}
            </p>
          )}
        </div>
        {n.pushSupported && (
          <Toggle on={n.pushHere} busy={busy === "push"} label="Notifications on this device" onClick={() => run("push", n.pushHere ? n.disablePush : n.enablePush)} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t-2 border-ink/10 pt-3">
        <div>
          <p className="font-bold">Telegram</p>
          <p className="text-sm text-ink/60">{tgLinked ? "Connected to our Telegram bot." : "One tap: opens our bot, tap Start."}</p>
        </div>
        {tgLinked ? (
          <div className="flex items-center gap-3">
            <Toggle on={tgOn} busy={busy === "tg"} label="Telegram alerts" onClick={() => run("tg", () => n.setTelegramEnabled(!tgOn))} />
            <button className="text-sm text-ink/60 underline" disabled={Boolean(busy)} onClick={() => run("tg-off", n.disconnectTelegram)}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn-secondary" disabled={busy === "tg-link"} onClick={() => run("tg-link", n.connectTelegram)}>
            {busy === "tg-link" ? <><Spinner /> Waiting for Start…</> : "Connect"}
          </button>
        )}
      </div>
      {n.prefs?.emailReady && (
        <div className="flex items-center justify-between gap-3 border-t-2 border-ink/10 pt-3">
          <div className="min-w-0">
            <p className="font-bold">Email</p>
            <p className="truncate text-sm text-ink/60">{email ?? "Add an email to get alerts there too."}</p>
          </div>
          {email ? (
            <Toggle on={emailOn} busy={busy === "email"} label="Email alerts" onClick={() => run("email", () => n.setEmailEnabled(!emailOn))} />
          ) : (
            <button
              className="btn-secondary"
              disabled={Boolean(busy)}
              onClick={() =>
                run("email-link", async () => {
                  linkEmail();
                  await n.setEmailEnabled(true);
                })
              }
            >
              Add email
            </button>
          )}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}

/** Compact prompt for the jury pool banner: one tap to get alerted when drawn. Hidden once any alert is on. */
export function AlertsNudge() {
  const n = useNotifications();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!n.prefs || n.anyOn) return null;
  const turnOn = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (n.pushSupported) await n.enablePush();
      else await n.connectTelegram();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm">
      <span>🔔 Get alerted when you&apos;re drawn, so you don&apos;t miss your vote.</span>
      <button className="rounded-full border-2 border-ink bg-verdict px-3 py-0.5 font-bold text-ink" disabled={busy} onClick={turnOn}>
        {busy ? "Turning on…" : n.pushSupported ? "Turn on" : "Use Telegram"}
      </button>
      {error && <span className="w-full text-verdict">{error}</span>}
    </div>
  );
}
