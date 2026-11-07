"use client";

import { useReadContracts } from "wagmi";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";

const STANDARD = 0;
const FAST = 1;

/** Live reads from the contract: fees, juror pool size, case count. */
export function ContractStatus() {
  const address = network.whosRight;
  const contract = { address, abi: whosRightAbi } as const;
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
    query: { enabled: Boolean(address) },
  });

  if (!address) return <p className="text-sm text-zinc-600">Not launched on {network.label} yet.</p>;
  if (isLoading) return <p className="text-sm text-zinc-600">Loading…</p>;
  if (isError || !data) return <p className="text-sm text-red-700">Couldn&apos;t reach {network.label}. Try again shortly.</p>;

  const [standardFee, fastFee, pool, minPool, cases, paused] = data;
  const sym = network.tokenSymbol;
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div className="rounded border border-zinc-200 p-3">
        <dt className="text-zinc-600">Standard (up to 12h)</dt>
        <dd className="text-lg font-semibold">{formatG(standardFee)} {sym} each</dd>
      </div>
      <div className="rounded border border-zinc-200 p-3">
        <dt className="text-zinc-600">Fast (up to 2h)</dt>
        <dd className="text-lg font-semibold">{formatG(fastFee)} {sym} each</dd>
      </div>
      <div className="rounded border border-zinc-200 p-3">
        <dt className="text-zinc-600">Jurors ready</dt>
        <dd className="text-lg font-semibold">
          {pool.toString()} <span className="text-sm font-normal text-zinc-600">(need {minPool.toString()})</span>
        </dd>
      </div>
      <div className="rounded border border-zinc-200 p-3">
        <dt className="text-zinc-600">Cases so far</dt>
        <dd className="text-lg font-semibold">{cases.toString()}</dd>
      </div>
      {paused && <p className="col-span-2 text-amber-800">New cases are paused right now.</p>}
    </dl>
  );
}
