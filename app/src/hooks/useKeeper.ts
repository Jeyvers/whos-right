"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

export type KeeperStatus = { configured: boolean; capped: boolean; cappedUntil: string | null; lastRunAt: string | null; healthy: boolean };

export function useKeeperStatus() {
  return useQuery({
    queryKey: ["keeper-status"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<KeeperStatus> => (await fetch("/api/keeper/status")).json(),
  });
}

/** Nudges the keeper (at most once a minute) while a case is waiting on an automatic step. */
export function useKeeperPoke(needed: boolean) {
  const { authenticated, getAccessToken } = usePrivy();
  const last = useRef(0);
  useEffect(() => {
    if (!needed || !authenticated || Date.now() - last.current < 60_000) return;
    last.current = Date.now();
    getAccessToken().then((token) =>
      fetch("/api/keeper/poke", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => {}),
    );
  }, [needed, authenticated, getAccessToken]);
}
