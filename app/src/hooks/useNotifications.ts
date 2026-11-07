"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useAuthFetch } from "./useAuthFetch";

type Prefs = { pushEnabled: boolean; telegramEnabled: boolean; telegramLinked: boolean; pushDevices: number };

function urlB64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Jury alerts: browser push on this device, and Telegram. */
export function useNotifications() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  const prefs = useQuery({ queryKey: ["notify-prefs"], queryFn: () => authFetch<Prefs>("/api/notify/prefs") });
  const [pushSupported, setPushSupported] = useState(false);
  const [pushHere, setPushHere] = useState(false); // this device is subscribed
  const [needsHomeScreen, setNeedsHomeScreen] = useState(false);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capabilities are only known after mount
    setPushSupported(supported);
    setNeedsHomeScreen(ios && !standalone && !supported);
    if (supported) {
      navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => setPushHere(Boolean(await reg?.pushManager.getSubscription())));
    }
  }, []);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["notify-prefs"] }), [qc]);

  const enablePush = useCallback(async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) throw new Error("Notifications aren't set up yet.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notifications are blocked. Allow them for this site in your browser settings.");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) }));
    await authFetch("/api/notify/push", { method: "POST", body: JSON.stringify(sub.toJSON()) });
    setPushHere(true);
    await refresh();
  }, [authFetch, refresh]);

  const disablePush = useCallback(async () => {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await authFetch("/api/notify/push", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setPushHere(false);
    await refresh();
  }, [authFetch, refresh]);

  const connectTelegram = useCallback(async () => {
    // Open the window first (synchronously, so it isn't treated as a popup), then point it at the bot.
    const win = window.open("about:blank", "_blank");
    try {
      const { url } = await authFetch<{ url: string }>("/api/notify/telegram", { method: "POST" });
      if (win) win.location.href = url;
      else window.location.href = url;
      // Pick up the link as soon as /start lands.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const p = await authFetch<Prefs>("/api/notify/prefs");
        if (p.telegramLinked) break;
      }
    } catch (e) {
      win?.close();
      throw e;
    } finally {
      await refresh();
    }
  }, [authFetch, refresh]);

  const disconnectTelegram = useCallback(async () => {
    await authFetch("/api/notify/telegram", { method: "DELETE" });
    await refresh();
  }, [authFetch, refresh]);

  const setTelegramEnabled = useCallback(
    async (on: boolean) => {
      await authFetch("/api/notify/prefs", { method: "POST", body: JSON.stringify({ telegramEnabled: on }) });
      await refresh();
    },
    [authFetch, refresh],
  );

  const anyOn = Boolean((pushHere && prefs.data?.pushEnabled !== false) || (prefs.data?.telegramLinked && prefs.data.telegramEnabled));
  return { prefs: prefs.data, pushSupported, pushHere, needsHomeScreen, anyOn, enablePush, disablePush, connectTelegram, disconnectTelegram, setTelegramEnabled };
}
