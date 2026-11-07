"use client";

import { useExportWallet, useWallets } from "@privy-io/react-auth";
import { useState } from "react";
import { getAddress, isAddress, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { ErrorNote, Hint, Panel } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import { useTx } from "@/hooks/useTx";
import { erc20Abi } from "@/lib/abi/tokens";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";

/** Your G$ is yours: send it anywhere, any time, and export your wallet's key. */
export function SelfCustody() {
  const me = useMe();
  const sendTx = useTx();
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { exportWallet } = useExportWallet();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState<string>();
  const sym = network.tokenSymbol;
  const builtIn = wallets.some((w) => w.walletClientType === "privy" && address && w.address.toLowerCase() === address.toLowerCase());

  async function send() {
    setError(undefined);
    setSent(undefined);
    if (!isAddress(to)) return setError("Enter a valid wallet address (0x…).");
    let value: bigint;
    try {
      value = parseUnits(amount.trim(), 18);
    } catch {
      return setError("Enter an amount, like 50.");
    }
    if (value <= 0n) return setError("Enter an amount above 0.");
    if (value > me.gBalance) return setError(`You only have ${formatG(me.gBalance)} ${sym}.`);
    setBusy(true);
    try {
      // Always confirmed in the wallet: transfers are never signed silently.
      await sendTx({ address: network.goodDollar, abi: erc20Abi, functionName: "transfer", args: [getAddress(to), value] });
      setSent(`Sent ${formatG(value)} ${sym}.`);
      setAmount("");
      await me.refetch();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <p className="font-display text-xl font-extrabold">Your {sym}, your wallet</p>
      <Hint>Your wallet is yours alone. Send your {sym} anywhere, any time.</Hint>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Send to
        <input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x…" className="rounded-xl border-2 border-ink/30 px-3 py-2 font-mono text-sm font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Amount ({sym})
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="flex-1 rounded-xl border-2 border-ink/30 px-3 py-2 font-normal" />
          <button type="button" className="btn-secondary" onClick={() => setAmount(formatG(me.gBalance).replace(/,/g, ""))}>Max</button>
        </div>
      </label>
      <button className="btn-secondary self-start" disabled={busy} onClick={send}>{busy ? "Sending…" : `Send ${sym}`}</button>
      {sent && <p className="font-semibold text-side-b">{sent}</p>}
      <ErrorNote>{error}</ErrorNote>
      {builtIn && (
        <div className="flex flex-col gap-1 border-t-2 border-ink/10 pt-3">
          <button className="btn-secondary self-start" onClick={() => exportWallet({ address: address! }).catch(() => {})}>
            Export wallet key
          </button>
          <Hint>Opens a secure Privy window. Anyone with this key controls your wallet, so never share it.</Hint>
        </div>
      )}
    </Panel>
  );
}
