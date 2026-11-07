"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, type ReactNode } from "react";
import { testnetIdentityAbi } from "@/lib/abi/tokens";
import { friendlyError } from "@/lib/errors";
import { network } from "@/lib/network";
import { useMe } from "@/hooks/useMe";
import { useTx } from "@/hooks/useTx";
import { ErrorNote, Hint, Panel } from "./ui";
import { Loading } from "./Loading";
import { Spinner } from "@/components/Loading";

/**
 * Shows `children` once the person is signed in (and, on mainnet, verified).
 * Gas is no longer a gate: actions top it up automatically. On testnet the stand-in verification runs as part
 * of the action itself, so it doesn't block either.
 */
export function Gate({ children, needVerified = true }: { children: ReactNode; needVerified?: boolean }) {
  const { ready, authenticated, login } = usePrivy();
  const me = useMe();

  if (!ready) return <Panel><Loading /></Panel>;
  if (!authenticated) {
    return (
      <Panel>
        <p className="font-display text-xl font-bold">Sign in to continue</p>
        <button className="btn self-start" onClick={login}>Sign in</button>
      </Panel>
    );
  }
  if (!me.address || !me.ready) return <Panel><Loading label="Checking your wallet…" /></Panel>;
  if (needVerified && !me.verified && !network.testnet) return <VerifyPrompt />;
  return <>{children}</>;
}

export function VerifyPrompt() {
  const sendTx = useTx();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const testnet = network.testnet;

  return (
    <Panel tone="yellow">
      <p className="font-display text-xl font-extrabold">Only real people can decide cases.</p>
      <p>Verify once to continue.</p>
      {testnet ? (
        <>
          <button
            className="btn self-start bg-white"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              try {
                await sendTx({ address: testnet.selfVerifyIdentity, abi: testnetIdentityAbi, functionName: "verifyMe" });
                await me.refetch();
              } catch (e) {
                setError(friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <><Spinner /> Verifying…</> : "Verify (test)"}
          </button>
          <Hint>Test network: this button stands in for GoodDollar face verification.</Hint>
        </>
      ) : (
        <Hint>GoodDollar face verification opens here at launch.</Hint>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}
