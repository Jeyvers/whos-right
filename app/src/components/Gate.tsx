"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState, type ReactNode } from "react";
import { testnetIdentityAbi } from "@/lib/abi/tokens";
import { friendlyError } from "@/lib/errors";
import { network } from "@/lib/network";
import { useMe } from "@/hooks/useMe";
import { useTx } from "@/hooks/useTx";
import { ErrorNote, Hint, Panel } from "./ui";

/**
 * Shows `children` only once the person is signed in, verified, and has a little gas.
 * Each missing step gets one clear prompt.
 */
export function Gate({ children, needVerified = true }: { children: ReactNode; needVerified?: boolean }) {
  const { ready, authenticated, login } = usePrivy();
  const me = useMe();

  if (!ready) return <Panel><Hint>Loading…</Hint></Panel>;
  if (!authenticated) {
    return (
      <Panel>
        <p className="font-display text-xl font-bold">Sign in to continue</p>
        <button className="btn self-start" onClick={login}>Sign in</button>
      </Panel>
    );
  }
  if (!me.address || !me.ready) return <Panel><Hint>Checking your wallet…</Hint></Panel>;
  if (needVerified && !me.verified) return <VerifyPrompt />;
  if (me.gasBalance === 0n) return <GasPrompt address={me.address} />;
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
          {me.gasBalance === 0n ? (
            <GasNote address={me.address} />
          ) : (
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
              {busy ? "Verifying…" : "Verify (test)"}
            </button>
          )}
          <Hint>Test network: this button stands in for GoodDollar face verification.</Hint>
        </>
      ) : (
        <Hint>GoodDollar face verification opens here at launch.</Hint>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}

function GasNote({ address }: { address?: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-semibold">You need a little CELO to pay network fees.</p>
      {network.testnet ? (
        <p>
          Get free test CELO at{" "}
          <a className="font-bold underline" href="https://faucet.celo.org/celo-sepolia" target="_blank" rel="noreferrer">
            faucet.celo.org
          </a>{" "}
          for your wallet:
        </p>
      ) : (
        <p>Send a little CELO to your wallet:</p>
      )}
      <code className="break-all rounded-lg bg-ink/5 px-2 py-1">{address}</code>
      <button className="btn-secondary self-start" onClick={() => address && navigator.clipboard.writeText(address)}>
        Copy address
      </button>
    </div>
  );
}

function GasPrompt({ address }: { address: string }) {
  return (
    <Panel tone="yellow">
      <GasNote address={address} />
      <Hint>This page updates by itself once it arrives.</Hint>
    </Panel>
  );
}
