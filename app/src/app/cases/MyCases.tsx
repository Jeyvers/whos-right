"use client";

import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { Gate } from "@/components/Gate";
import { useQuery } from "@tanstack/react-query";
import { Hint } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { WithdrawPanel } from "@/components/WithdrawPanel";
import { useNow } from "@/hooks/useNow";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { SPEED, ZERO_ADDRESS, type ChainCase } from "@/lib/cases";
import { formatG } from "@/lib/format";
import { myCredit, myRole, myStage, STAGE_LABEL, type MyRole, type MyStage } from "@/lib/myCases";
import { network } from "@/lib/network";
import { Loading } from "@/components/Loading";

/** "My cases" tab: your "called it" record, money waiting, and every case you opened, joined or judged. */
export function MyCases() {
  return (
    <Gate needVerified={false}>
      <CalledItSummary />
      <WithdrawPanel />
      <CaseList />
    </Gate>
  );
}

type Calls = { decided: number; right: number; pending: number; streak: number };

/** How often your crowd votes matched the official jury. */
function CalledItSummary() {
  const authFetch = useAuthFetch();
  const { data } = useQuery({ queryKey: ["my-calls"], queryFn: () => authFetch<Calls>("/api/me/calls"), refetchInterval: 60_000 });
  if (!data || data.decided + data.pending === 0) return null;
  const pct = data.decided ? Math.round((data.right / data.decided) * 100) : 0;
  return (
    <section className="tile grid grid-cols-3 overflow-hidden bg-ink text-center text-white">
      <div className="border-r-2 border-white/15 p-3">
        <p className="font-display text-3xl font-extrabold text-verdict">
          {data.right}
          <span className="text-lg text-white/60">/{data.decided}</span>
        </p>
        <p className="text-sm">You called it{data.decided ? ` (${pct}%)` : ""}</p>
      </div>
      <div className="border-r-2 border-white/15 p-3">
        <p className="font-display text-3xl font-extrabold text-side-b">{data.streak}</p>
        <p className="text-sm">Streak</p>
      </div>
      <div className="p-3">
        <p className="font-display text-3xl font-extrabold">{data.pending}</p>
        <p className="text-sm">Waiting on a verdict</p>
      </div>
    </section>
  );
}

/**
 * Scans recent case ids (newest first) for ones this wallet took part in. Fine at today's volume; the indexer
 * planned for metrics replaces this scan later.
 */
const SCAN = 100;
const ROLE_LABEL: Record<MyRole, string> = { opened: "You opened", joined: "You joined", judged: "You judged" };
const STAGE_STYLE: Record<MyStage, string> = {
  waiting: "bg-white",
  drawing: "bg-verdict",
  voting: "bg-side-b text-white",
  resolved: "bg-court text-white",
  tie: "bg-zinc-200",
  expired: "bg-zinc-200",
  refunded: "bg-zinc-200",
};

function CaseList() {
  const { address } = useAccount();
  const now = useNow(30_000);
  const wr = network.whosRight!;
  const me = address ?? ZERO_ADDRESS;
  const count = useReadContract({ address: wr, abi: whosRightAbi, functionName: "caseCount", query: { refetchInterval: 20_000 } });
  const n = Number(count.data ?? 0n);
  const ids = Array.from({ length: Math.min(n, SCAN) }, (_, i) => BigInt(n - i));
  const reads = useReadContracts({
    contracts: ids.flatMap((id) => [
      { address: wr, abi: whosRightAbi, functionName: "getCase" as const, args: [id] as const },
      { address: wr, abi: whosRightAbi, functionName: "getJurorVote" as const, args: [id, me] as const },
    ]),
    allowFailure: false,
    query: { enabled: ids.length > 0 && Boolean(address), refetchInterval: 20_000 },
  });

  if (count.isLoading || (ids.length > 0 && reads.isLoading)) return <Loading label="Finding your cases…" />;
  if (reads.isError) return <Hint>Couldn&apos;t load your cases. Refresh to try again.</Hint>;

  const rows = ids.flatMap((id, i) => {
    const c = reads.data?.[i * 2] as ChainCase | undefined;
    const vote = reads.data?.[i * 2 + 1] as { root: string; revealed: boolean } | undefined;
    if (!c || !vote) return [];
    const role = myRole(c, me, vote.root !== ZERO_ADDRESS);
    if (!role) return [];
    return [{ id, c, role, stage: myStage(c, now), credit: myCredit(c, role, vote.revealed) }];
  });

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Hint>No cases yet. Start one, or join the jury pool to judge others.</Hint>
        <div className="flex gap-2">
          <Link href="/new" className="btn">Start a case</Link>
          <Link href="/jury" className="btn bg-white">Be a juror</Link>
        </div>
      </div>
    );
  }

  const sym = network.tokenSymbol;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map(({ id, c, role, stage, credit }) => {
        const done = stage === "resolved" || stage === "tie" || stage === "refunded" || (stage === "expired" && c.status === 6);
        return (
          <li key={id.toString()} className="tile flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/c/${id}`} className="font-display text-lg font-extrabold hover:underline underline-offset-4">
                Case #{id.toString()}
              </Link>
              <span className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${STAGE_STYLE[stage]}`}>
                {STAGE_LABEL[stage]}
              </span>
            </div>
            <p className="text-sm text-ink/70">
              {ROLE_LABEL[role]} · {c.mode === 1 ? "Ask the jury" : "Settle it together"} · {c.speed === SPEED.Fast ? "Fast" : "Standard"} ·{" "}
              {formatG(c.fee)} {sym}{c.mode === 1 ? "" : " each"}
              {stage === "resolved" &&
                (c.mode === 1
                  ? ` · Jury said ${c.verdict === 1 ? "Right" : "Wrong"}`
                  : ` · ${c.verdict === 1 ? "First side" : "Their side"} won ${c.votesA}–${c.votesB}`)}
            </p>
            {credit > 0n && (
              <p className="text-sm font-semibold">
                {role === "judged" ? "You earned" : "Refunded to you"}: {formatG(credit)} {sym}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Link href={`/c/${id}`} className="btn-secondary">Open case</Link>
              {done && <Link href={`/c/${id}#verdict`} className="btn-secondary">{stage === "resolved" ? "Verdict card" : "Outcome"}</Link>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
