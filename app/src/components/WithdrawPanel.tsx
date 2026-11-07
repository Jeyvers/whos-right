"use client";

import { useState } from "react";
import { useMe } from "@/hooks/useMe";
import { useTx } from "@/hooks/useTx";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { ErrorNote, Panel } from "./ui";

/** Refunds and juror pay waiting in the contract. Renders nothing when there's none. */
export function WithdrawPanel() {
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
            await sendTx({ address: network.whosRight!, abi: whosRightAbi, functionName: "withdraw" });
            await me.refetch();
          } catch (e) {
            setError(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}
