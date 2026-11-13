"use client";

import { useReadContracts } from "wagmi";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { Loading } from "./Loading";

const STANDARD = 0;
const FAST = 1;

function Hourglass() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9s10 4 10 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function Bolt() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="#1B1035" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Live reads from the contract: fees per speed, juror pool, case count. */
export function ContractStatus() {
  const address = network.restMyCase;
  const contract = { address, abi: restMyCaseAbi } as const;
  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      { ...contract, functionName: "speedFee", args: [STANDARD] },
      { ...contract, functionName: "speedFee", args: [FAST] },
      { ...contract, functionName: "activePoolSize" },
      { ...contract, functionName: "minPoolSize" },
      { ...contract, functionName: "caseCount" },
      { ...contract, functionName: "newCasesPaused" },
    ],
    allowFailure: false,
    // Live: re-read every 15s while the page is open (and on tab focus).
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  if (!address) return <p className="tile p-4">Not open on {network.label} yet.</p>;
  if (isLoading) return <div className="tile p-4"><Loading label="Checking the courtroom…" /></div>;
  if (isError || !data) {
    return <p className="tile border-side-a p-4">Couldn&apos;t reach {network.label}. Refresh to try again.</p>;
  }

  const [standardFee, fastFee, pool, minPool, cases, paused] = data;
  const sym = network.tokenSymbol;
  const ready = pool >= minPool;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="tile flex flex-col gap-1 p-4">
          <span className="text-court"><Hourglass /></span>
          <p className="font-display text-xl font-extrabold">Standard</p>
          <p className="text-sm text-ink/70">Verdict within 12 hours</p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            {formatG(standardFee)} <span className="text-base">{sym}</span>
          </p>
          <p className="text-xs text-ink/60">each side</p>
        </div>
        <div className="tile flex flex-col gap-1 bg-verdict p-4">
          <span className="text-white"><Bolt /></span>
          <p className="font-display text-xl font-extrabold">Fast</p>
          <p className="text-sm text-ink/70">Verdict within 2 hours</p>
          <p className="mt-2 font-display text-3xl font-extrabold">
            {formatG(fastFee)} <span className="text-base">{sym}</span>
          </p>
          <p className="text-xs text-ink/60">each side</p>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border-[3px] border-ink bg-ink text-white">
        <div className="flex flex-col items-center gap-0.5 border-r-2 border-white/15 p-3">
          <p className="font-display text-3xl font-extrabold text-verdict">
            {pool.toString()}
            <span className="text-lg text-white/60">/{minPool.toString()}</span>
          </p>
          <p className="text-sm">{ready ? "Jurors ready" : "Jurors needed to start"}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 p-3">
          <p className="font-display text-3xl font-extrabold text-side-b">{cases.toString()}</p>
          <p className="text-sm">Cases heard</p>
        </div>
      </div>
      {paused && <p className="rounded-xl bg-side-a/15 p-3 font-semibold">New cases are paused right now.</p>}
    </div>
  );
}
