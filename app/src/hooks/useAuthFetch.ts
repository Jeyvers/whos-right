"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";

/** fetch() with the Privy access token attached. Throws with the server's error message on failure. */
export function useAuthFetch() {
  const { getAccessToken } = usePrivy();
  return useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
      const token = await getAccessToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      const res = await fetch(url, { ...init, headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      return json as T;
    },
    [getAccessToken],
  );
}
