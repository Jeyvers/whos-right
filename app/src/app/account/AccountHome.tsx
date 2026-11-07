"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { formatEther } from "viem";
import { Gate, VerifyPrompt } from "@/components/Gate";
import { ErrorNote, Hint, Page, Panel, Title } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { useTx } from "@/hooks/useTx";
import { testnetFaucetAbi } from "@/lib/abi/tokens";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { WithdrawPanel } from "@/components/WithdrawPanel";
import { SelfCustody } from "./SelfCustody";
import { ClaimPanel } from "@/components/ClaimPanel";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { Spinner } from "@/components/Loading";

export function AccountHome() {
  return (
    <Page>
      <Title>Your account</Title>
      <Gate needVerified={false}>
        <AccountBody />
      </Gate>
    </Page>
  );
}

function AccountBody() {
  const me = useMe();
  const { logout, user } = usePrivy();
  const sendTx = useTx();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const sym = network.tokenSymbol;
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
      await me.refetch();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <WithdrawPanel />

      {!me.verified && <VerifyPrompt />}

      <Panel>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-ink/60">G$ in wallet</dt>
            <dd className="font-display text-3xl font-extrabold">{formatG(me.gBalance)} <span className="text-base">{sym}</span></dd>
          </div>
          <div>
            <dt className="text-sm text-ink/60">Gas (CELO)</dt>
            <dd className="font-display text-3xl font-extrabold">{Number(formatEther(me.gasBalance)).toFixed(3)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink/60">Verified human</dt>
            <dd className="font-display text-xl font-extrabold">{me.verified ? "Yes ✓" : "Not yet"}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink/60">Jury pool</dt>
            <dd className="font-display text-xl font-extrabold">{me.inPool ? "In ✓" : "Not in"}</dd>
          </div>
        </dl>
        {network.testnet && (
          <div className="flex flex-col gap-1">
            <button
              className="btn-secondary self-start"
              disabled={Boolean(busy)}
              onClick={() => run("faucet", () => sendTx({ address: network.testnet!.faucetToken, abi: testnetFaucetAbi, functionName: "faucet" }))}
            >
              {busy === "faucet" ? <><Spinner /> Getting test G$…</> : "Get free test G$"}
            </button>
            <Hint>Test network: this stands in for the daily GoodDollar claim (free, as often as you need).</Hint>
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </Panel>

      <ClaimPanel />
      <NotificationsPanel />
      <SelfCustody />

      <Panel>
        <p className="text-sm text-ink/60">Signed in{user?.email?.address ? ` as ${user.email.address}` : user?.google?.email ? ` as ${user.google.email}` : ""}</p>
        <code className="break-all rounded-lg bg-ink/5 px-2 py-1 text-sm">{me.address}</code>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => me.address && navigator.clipboard.writeText(me.address)}>Copy address</button>
          <button className="btn-secondary" onClick={logout}>Sign out</button>
        </div>
      </Panel>
    </div>
  );
}
