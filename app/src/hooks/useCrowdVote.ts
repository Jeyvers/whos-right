"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { testnetIdentityAbi } from "@/lib/abi/tokens";
import { friendlyError } from "@/lib/errors";
import { network } from "@/lib/network";
import { useAuthFetch } from "./useAuthFetch";
import { useMe } from "./useMe";
import { useTx } from "./useTx";

const PENDING_KEY = "wr:pending-crowd-vote";
type Pending = { caseId: string; vote: number };

function readPending(): Pending | null {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
  } catch {
    return null;
  }
}
function writePending(p: Pending | null) {
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

/**
 * Crowd vote for one case. Signed out: remembers the choice, opens sign-in, and casts it as soon as sign-in
 * completes. Testnet: runs the stand-in verification first if needed (mainnet needs GoodDollar verification).
 */
export function useCrowdVote(caseId: string, initial: number | null) {
  const { authenticated, login } = usePrivy();
  const me = useMe();
  const sendTx = useTx();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const [cast_, setMyVote] = useState<number | null>(null);
  const myVote = cast_ ?? initial; // this session's vote, else what the server already has
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const resumed = useRef(false);

  const cast = useCallback(
    async (vote: number) => {
      setError(undefined);
      if (!authenticated) {
        writePending({ caseId, vote });
        login();
        return;
      }
      setBusy(true);
      try {
        if (!me.verified) {
          if (!network.testnet) throw new Error("Verify you're a real person with GoodDollar to vote.");
          await sendTx({ address: network.testnet.selfVerifyIdentity, abi: testnetIdentityAbi, functionName: "verifyMe" });
          await me.refetch();
        }
        await authFetch(`/api/cases/${caseId}/crowd`, { method: "POST", body: JSON.stringify({ vote }) });
        setMyVote(vote);
        // Results appear right away (poll-style): refresh the case and the feed so the tally comes back.
        queryClient.invalidateQueries({ queryKey: ["case-text", caseId] });
        queryClient.invalidateQueries({ queryKey: ["feed"] });
        queryClient.invalidateQueries({ queryKey: ["my-calls"] });
      } catch (e) {
        const msg = friendlyError(e);
        if (/already voted/i.test(msg)) setMyVote(vote);
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [authenticated, login, me, sendTx, authFetch, caseId, queryClient],
  );

  // Finish a vote that was waiting on sign-in.
  useEffect(() => {
    if (resumed.current || !authenticated || !me.ready) return;
    const p = readPending();
    if (!p || p.caseId !== caseId) return;
    resumed.current = true;
    writePending(null);
    // Deferred one tick (not in the effect body). Deliberately not cancelled on re-render: the pending vote has
    // already been taken out of storage, so cancelling here would lose it.
    setTimeout(() => void cast(p.vote), 0);
  }, [authenticated, me.ready, caseId, cast]);

  return { myVote, cast, busy, error };
}
