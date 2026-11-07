"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { friendlyError } from "@/lib/errors";
import { ErrorNote } from "./ui";

/**
 * Shown once, right after sign-up: what it means to bring a case here. Covers the whole app until agreed, and
 * the server refuses to save a side without it (api/sides), so it can't be skipped.
 */
export function AgreementGate() {
  const { ready, authenticated, user, logout } = usePrivy();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const key = ["agreement", user?.id];
  const status = useQuery({
    queryKey: key,
    enabled: ready && authenticated,
    staleTime: Infinity,
    queryFn: () => authFetch<{ agreed: boolean }>("/api/agreement"),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!ready || !authenticated || status.data?.agreed !== false) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agreement-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-court/95 px-4 py-8"
    >
      <div className="tile mx-auto flex max-w-lg flex-col gap-4 bg-white p-6">
        <h2 id="agreement-title" className="font-display text-3xl font-extrabold leading-tight">
          Before you start
        </h2>
        <p>Who&apos;s Right? settles arguments in the open. Here&apos;s how every case works:</p>
        <ul className="flex flex-col gap-3">
          <li className="rounded-2xl bg-verdict/40 p-3">
            <strong>Cases are public.</strong> Anyone can read both sides and the verdict.
          </li>
          <li className="rounded-2xl bg-ink/5 p-3">
            <strong>You can take a case down.</strong> Either side can remove it from public view at any time, from the
            case page.
          </li>
          <li className="rounded-2xl bg-ink/5 p-3">
            <strong>A random jury decides.</strong> Verified people you don&apos;t know read both sides and vote.
          </li>
        </ul>
        <p className="text-sm text-ink/65">
          More in our <Link href="/privacy" target="_blank" className="underline">Privacy</Link> and{" "}
          <Link href="/terms" target="_blank" className="underline">Terms</Link>.
        </p>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await authFetch("/api/agreement", { method: "POST" });
                queryClient.setQueryData(key, { agreed: true });
              } catch (e) {
                setError(friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "I agree"}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={logout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
