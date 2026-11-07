"use client";

import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { Gate } from "@/components/Gate";
import { Hint, Page, Title } from "@/components/ui";
import { WithdrawPanel } from "@/components/WithdrawPanel";
import { useNow } from "@/hooks/useNow";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { SPEED, ZERO_ADDRESS, type ChainCase } from "@/lib/cases";
import { formatG } from "@/lib/format";
import { myCredit, myRole, myStage, STAGE_LABEL, type MyRole, type MyStage } from "@/lib/myCases";
import { network } from "@/lib/network";

export function MyCases() {
  return (
    <Page>
      <Title sub="Every case you opened, joined or judged.">My cases</Title>
      <Gate needVerified={false}>
        <WithdrawPanel />
        <CaseList />
      </Gate>
    </Page>
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

  if (count.isLoading || (ids.length > 0 && reads.isLoading)) return <Hint>Finding your cases…</Hint>;
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
              {ROLE_LABEL[role]} · {c.speed === SPEED.Fast ? "Fast" : "Standard"} · {formatG(c.fee)} {sym} each
              {stage === "resolved" && ` · Side ${c.verdict === 1 ? "A" : "B"} won ${c.votesA}–${c.votesB}`}
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
