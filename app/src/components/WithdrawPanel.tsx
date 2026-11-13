"use client";

import { useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { Address } from "viem";
import { useMe } from "@/hooks/useMe";
import { useTx } from "@/hooks/useTx";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { ErrorNote, Panel } from "./ui";
import { Spinner } from "@/components/Loading";

/** Refunds and juror pay waiting in the contract (and any earlier one). Renders nothing when there's none. */
export function WithdrawPanel() {
  return (
    <>
      <CurrentWithdraw />
      <LegacyWithdraw />
    </>
  );
}

function CurrentWithdraw() {
  const me = useMe();
  const sendTx = useTx();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (me.owed === 0n) return null;

  return (
    <Panel tone="yellow">
      <p className="font-display text-2xl font-extrabold">
        {formatG(me.owed)} {network.tokenSymbol} ready to withdraw
      </p>
      <p>Juror pay and refunds wait here until you withdraw them to your wallet.</p>
      <button
        className="btn self-start bg-white"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            await sendTx({ address: network.restMyCase!, abi: restMyCaseAbi, functionName: "withdraw" });
            await me.refetch();
          } catch (e) {
            setError(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <><Spinner /> Withdrawing…</> : "Withdraw"}
      </button>
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}

/** Money still sitting in an earlier deployment (e.g. refunds from before a redeploy). */
function LegacyWithdraw() {
  const { address } = useAccount();
  const legacy = network.legacyContracts ?? [];
  const sendTx = useTx();
  const [busy, setBusy] = useState<Address>();
  const [error, setError] = useState<string>();
  const owed = useReadContracts({
    contracts: legacy.map((c) => ({ address: c, abi: restMyCaseAbi, functionName: "owed", args: [address!] }) as const),
    allowFailure: true,
    query: { enabled: Boolean(address) && legacy.length > 0, refetchInterval: 30_000 },
  });
  const rows = legacy
    .map((c, i) => ({ contract: c, amount: (owed.data?.[i]?.result as bigint | undefined) ?? 0n }))
    .filter((r) => r.amount > 0n);
  if (rows.length === 0) return null;

  return (
    <Panel tone="yellow">
      {rows.map((r) => (
        <div key={r.contract} className="flex flex-col gap-2">
          <p className="font-display text-2xl font-extrabold">
            {formatG(r.amount)} {network.tokenSymbol} from before the upgrade
          </p>
          <p>Refunds or juror pay from our previous contract. Withdraw them to your wallet any time.</p>
          <button
            className="btn self-start bg-white"
            disabled={Boolean(busy)}
            onClick={async () => {
              setBusy(r.contract);
              setError(undefined);
              try {
                await sendTx({ address: r.contract, abi: restMyCaseAbi, functionName: "withdraw" });
                await owed.refetch();
              } catch (e) {
                setError(friendlyError(e));
              } finally {
                setBusy(undefined);
              }
            }}
          >
            {busy === r.contract ? <><Spinner /> Withdrawing…</> : "Withdraw"}
          </button>
        </div>
      ))}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}
