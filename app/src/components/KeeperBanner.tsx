"use client";

import { useKeeperStatus } from "@/hooks/useKeeper";

/** Says plainly when automatic steps are paused, and that every case can still finish or be refunded. */
export function KeeperBanner() {
  const { data } = useKeeperStatus();
  if (!data?.configured) return null;
  if (data.capped) {
    const until = data.cappedUntil ? new Date(data.cappedUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "tomorrow";
    return (
      <div role="status" className="rounded-2xl border-[3px] border-ink bg-verdict p-4">
        <p className="font-display text-lg font-extrabold">Automatic steps are paused until {until}</p>
        <p className="text-sm">
          Today&apos;s budget for automatic steps is used up. Your case can still move: press the button below yourself
          (you pay a small network fee). If time runs out, you can always cancel and get a full refund.
        </p>
      </div>
    );
  }
  if (!data.healthy) {
    return (
      <div role="status" className="rounded-2xl border-2 border-ink/30 bg-white p-3 text-sm">
        Automatic steps are running late. You can press the button below yourself to move things along.
      </div>
    );
  }
  return null;
}
