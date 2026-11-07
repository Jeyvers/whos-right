"use client";

import Link from "next/link";
import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { Gate } from "@/components/Gate";
import { ErrorNote, Hint, Page, Panel, StatusPill, Title } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { useTx } from "@/hooks/useTx";
import { testnetIdentityAbi } from "@/lib/abi/tokens";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { sameAddress, statusName, type ChainCase } from "@/lib/cases";
import { friendlyError } from "@/lib/errors";
import { network } from "@/lib/network";

export function JuryHome() {
  return (
    <Page>
      <Title sub="Join the pool and you may be drawn to decide cases. Jurors who vote on time share the fees.">
        Be a juror
      </Title>
      <Gate>
        <PoolToggle />
        <MyJuryCases />
      </Gate>
    </Page>
  );
}

function PoolToggle() {
  const me = useMe();
  const sendTx = useTx();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (fn: "joinPool" | "leavePool") => {
    setBusy(true);
    setError(undefined);
    try {
      if (fn === "joinPool" && !me.verified && network.testnet) {
        await sendTx({ address: network.testnet.selfVerifyIdentity, abi: testnetIdentityAbi, functionName: "verifyMe" });
      }
      await sendTx({ address: network.whosRight!, abi: whosRightAbi, functionName: fn });
      await me.refetch();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel tone={me.inPool ? "court" : "yellow"}>
      <p className="font-display text-2xl font-extrabold">{me.inPool ? "You're in the jury pool ✓" : "You're not in the pool yet"}</p>
      <p>{me.inPool ? "When you're drawn, the case shows up below. Check back often: voting windows can be short." : "It's free to join, and you can leave any time."}</p>
      <button className={`btn self-start ${me.inPool ? "bg-white" : ""}`} disabled={busy} onClick={() => run(me.inPool ? "leavePool" : "joinPool")}>
        {busy ? "Working…" : me.inPool ? "Leave the pool" : "Join the jury pool"}
      </button>
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}

/** Scans recent cases for ones where I'm a juror. Fine at today's volume; an indexer replaces this later. */
const SCAN = 50;
function MyJuryCases() {
  const me = useMe();
  const wr = network.whosRight!;
  const count = useReadContract({ address: wr, abi: whosRightAbi, functionName: "caseCount", query: { refetchInterval: 15_000 } });
  const n = Number(count.data ?? 0n);
  const ids = Array.from({ length: Math.min(n, SCAN) }, (_, i) => BigInt(n - i));
  const jurors = useReadContracts({
    contracts: ids.map((id) => ({ address: wr, abi: whosRightAbi, functionName: "getJurors" as const, args: [id] as const })),
    allowFailure: false,
    query: { enabled: ids.length > 0, refetchInterval: 15_000 },
  });
  const mine = ids.filter((_, i) => (jurors.data?.[i] as readonly string[] | undefined)?.some((j) => sameAddress(j, me.address)));
  const cases = useReadContracts({
    contracts: mine.map((id) => ({ address: wr, abi: whosRightAbi, functionName: "getCase" as const, args: [id] as const })),
    allowFailure: false,
    query: { enabled: mine.length > 0, refetchInterval: 15_000 },
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl font-extrabold">Your cases to judge</h2>
      {mine.length === 0 ? (
        <Hint>No cases yet. When you&apos;re drawn, they appear here.</Hint>
      ) : (
        <ul className="flex flex-col gap-3">
          {mine.map((id, i) => {
            const c = cases.data?.[i] as ChainCase | undefined;
            return (
              <li key={id.toString()}>
                <Link href={`/c/${id}`} className="tile flex items-center justify-between gap-3 p-4">
                  <span className="font-display text-lg font-bold">Case #{id.toString()}</span>
                  {c && <StatusPill status={statusName(c)} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
