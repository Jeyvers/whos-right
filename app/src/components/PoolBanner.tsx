"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { Loading, Spinner } from "@/components/Loading";
import { ErrorNote } from "@/components/ui";
import { VerifyPrompt } from "@/components/Gate";
import { AlertsNudge } from "@/components/NotificationsPanel";
import { useMe } from "@/hooks/useMe";
import { useNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { testnetIdentityAbi } from "@/lib/abi/tokens";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { sameAddress, timeLeft, type ChainCase } from "@/lib/cases";
import { friendlyError } from "@/lib/errors";
import { network } from "@/lib/network";

/**
 * Jury pool status for the judging page: join (automatically when arriving via "Be a juror", ?join=1) or leave,
 * plus the cases you've been drawn for, pinned above the feed.
 */
export function PoolBanner() {
  const me = useMe();
  const sendTx = useTx();
  const autoJoin = useSearchParams().get("join") === "1";
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false); // shown immediately on success, before slower reads catch up
  const [left, setLeft] = useState(false);
  const [error, setError] = useState<string>();
  const tried = useRef(false);
  const inPool = (me.inPool || joined) && !left;

  async function join() {
    setJoining(true);
    setError(undefined);
    try {
      if (!me.verified && network.testnet) {
        await sendTx({ address: network.testnet.selfVerifyIdentity, abi: testnetIdentityAbi, functionName: "verifyMe" });
      }
      await sendTx({ address: network.restMyCase!, abi: restMyCaseAbi, functionName: "joinPool" });
      setJoined(true);
      setLeft(false);
      void me.refetch();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    setJoining(true);
    setError(undefined);
    try {
      await sendTx({ address: network.restMyCase!, abi: restMyCaseAbi, functionName: "leavePool" });
      setLeft(true);
      setJoined(false);
      void me.refetch();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setJoining(false);
    }
  }

  // Came from "Be a juror": start joining immediately, once.
  useEffect(() => {
    if (!autoJoin || tried.current || !me.ready || me.inPool) return;
    tried.current = true;
    const t = setTimeout(() => void join(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when ready
  }, [autoJoin, me.ready, me.inPool]);

  if (!me.ready) return <Loading label="Checking your wallet…" />;
  if (!me.verified && !network.testnet && !inPool) return <VerifyPrompt />;

  if (joining && !inPool) {
    return (
      <div className="tile flex flex-col items-center gap-3 bg-court p-8 text-white">
        <Loading size="lg" label="Adding you to the jury pool…" />
        <p className="text-white/80">One moment. This takes a few seconds.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {inPool ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-[3px] border-ink bg-court px-4 py-3 text-white shadow-[0_4px_0_0_var(--color-ink)]">
          <p className="font-display text-lg font-extrabold">You&apos;re in the jury pool ✓</p>
          <p className="text-sm text-white/80">When you&apos;re drawn, your case is pinned here. Meanwhile, judge the cases below.</p>
          <div className="w-full"><AlertsNudge /></div>
          <button className="ml-auto text-sm text-white/70 underline underline-offset-4" disabled={joining} onClick={leave}>
            {joining ? "Leaving…" : "Leave the pool"}
          </button>
        </div>
      ) : (
        <div className="tile flex flex-col gap-3 bg-verdict p-5">
          <p className="font-display text-2xl font-extrabold">Join the jury pool</p>
          <p>Get drawn at random to decide real cases. Jurors who vote on time share the fees. Free to join, leave any time.</p>
          <button className="btn self-start bg-white" disabled={joining} onClick={join}>
            {joining ? <><Spinner /> Joining…</> : "Join the jury pool"}
          </button>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
      <JuryDuty />
    </div>
  );
}

/** Cases you've been drawn for that still need you, pinned above the feed. Hidden when there are none. */
const SCAN = 50;
export function JuryDuty() {
  const { address } = useAccount();
  const now = useNow(30_000);
  const wr = network.restMyCase!;
  const count = useReadContract({ address: wr, abi: restMyCaseAbi, functionName: "caseCount", query: { refetchInterval: 15_000 } });
  const n = Number(count.data ?? 0n);
  const ids = Array.from({ length: Math.min(n, SCAN) }, (_, i) => BigInt(n - i));
  const reads = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: wr, abi: restMyCaseAbi, functionName: "getJurors" as const, args: [id] as const },
      { address: wr, abi: restMyCaseAbi, functionName: "getCase" as const, args: [id] as const },
    ]),
    allowFailure: false,
    query: { enabled: ids.length > 0 && Boolean(address), refetchInterval: 15_000 },
  });
  const duty = ids.flatMap((id, i) => {
    const jurors = reads.data?.[i * 2] as readonly string[] | undefined;
    const c = reads.data?.[i * 2 + 1] as ChainCase | undefined;
    if (!c || c.status !== 4 || !jurors?.some((j) => sameAddress(j, address))) return [];
    return [{ id, c }];
  });
  if (duty.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-extrabold">📣 You&apos;ve been called</h2>
      {duty.map(({ id, c }) => {
        const revealOpen = now > Number(c.commitDeadline);
        return (
          <Link key={id.toString()} href={`/c/${id}`} className="tile flex items-center justify-between gap-3 bg-verdict p-4">
            <div>
              <p className="font-display text-lg font-extrabold">Case #{id.toString()}: your vote counts and pays</p>
              <p className="text-sm">
                {revealOpen ? "Reveal your vote" : "Vote"} · {timeLeft(revealOpen ? c.revealDeadline : c.commitDeadline, now)} left
              </p>
            </div>
            <span className="btn shrink-0 bg-white px-4 py-2 text-base">Go</span>
          </Link>
        );
      })}
    </section>
  );
}
