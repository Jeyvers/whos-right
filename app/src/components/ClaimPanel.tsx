"use client";

import { useState } from "react";
import { useDailyClaim } from "@/hooks/useDailyClaim";
import { alreadyClaimedMessage, untilText } from "@/lib/claim";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { Spinner } from "./Loading";
import { ErrorNote, Hint, Panel } from "./ui";

/** Today's GoodDollar claim on Account (mainnet). On testnet the Account page shows the test G$ faucet instead. */
export function ClaimPanel() {
  const { state, claim } = useDailyClaim();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  if (network.testnet || state.kind === "testnet" || state.kind === "not_verified") return null;

  return (
    <Panel tone={state.kind === "can_claim" ? "yellow" : "white"}>
      <p className="font-display text-xl font-extrabold">Today&apos;s G$</p>
      {state.kind === "loading" && <Hint>Checking your claim…</Hint>}
      {state.kind === "can_claim" && (
        <>
          <p>
            <strong>{formatG(state.amount)} G$</strong> is ready to claim. It&apos;s your daily GoodDollar income, free for
            verified people.
          </p>
          <button
            className="btn self-start bg-white"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                const amount = state.amount;
                await claim();
                setDone(`Claimed ${formatG(amount)} G$ ✓`);
              } catch (e) {
                setError(friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <><Spinner /> Claiming…</> : "Claim today's G$"}
          </button>
          <Hint>Next claim opens {untilText(state.nextClaimAt)} after today&apos;s.</Hint>
        </>
      )}
      {state.kind === "already_claimed" && <p className="text-sm">{done ?? alreadyClaimedMessage(state)}</p>}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}
