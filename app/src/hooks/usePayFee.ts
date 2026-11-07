"use client";

import { useCallback, useState } from "react";
import { erc20Abi, testnetFaucetAbi } from "@/lib/abi/tokens";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { useMe } from "./useMe";
import { useTx } from "./useTx";

/** tG$ the testnet faucet gives per call; the stand-in for "today's claim" on Celo Sepolia. */
const TESTNET_FAUCET_AMOUNT = 10_000n * 10n ** 18n;

/**
 * Today's claimable G$. Testnet: the faucet stands in for the daily claim.
 * Mainnet: wired to GoodDollar's UBI claim in a later phase; until then 0 (never assumed).
 */
function todaysClaim(): bigint {
  return network.testnet ? TESTNET_FAUCET_AMOUNT : 0n;
}

export type PayStep = "idle" | "claiming" | "approving" | "paying" | "done";

/**
 * "Use today's claim" payment. Before paying it checks balance + today's claim, then in ONE tap runs:
 * claim (only if needed) -> approve (exact fee, only if needed) -> the pay action.
 * Never assumes one claim covers the fee: if balance + claim is still short, it stops with a clear message.
 */
export function usePayFee() {
  const me = useMe();
  const sendTx = useTx();
  const [step, setStep] = useState<PayStep>("idle");
  const [error, setError] = useState<string>();

  const sym = network.tokenSymbol;
  const shortfall = (fee: bigint) => {
    const claim = me.gBalance >= fee ? 0n : todaysClaim();
    return me.gBalance + claim >= fee ? 0n : fee - (me.gBalance + claim);
  };
  const needsClaim = (fee: bigint) => me.gBalance < fee;

  const pay = useCallback(
    async (fee: bigint, action: () => Promise<void>): Promise<boolean> => {
      setError(undefined);
      try {
        if (!me.verified) throw new Error("Verify you're a real person first.");
        if (me.gasBalance === 0n) throw new Error("You need a little CELO for the network fee (gas).");
        let balance = me.gBalance;
        if (balance < fee) {
          const claim = todaysClaim();
          if (balance + claim < fee) {
            throw new Error(
              `You need ${formatG(fee)} ${sym}. You have ${formatG(balance)} ${sym}` +
                (claim > 0n ? ` plus ${formatG(claim)} ${sym} from today's claim.` : ", and no claim left today.") +
                " Pick Standard or come back after your next claim.",
            );
          }
          setStep("claiming");
          if (network.testnet) {
            await sendTx({ address: network.testnet.faucetToken, abi: testnetFaucetAbi, functionName: "faucet" });
          }
          balance += claim;
        }
        if (me.allowance < fee) {
          setStep("approving");
          await sendTx({
            address: network.goodDollar,
            abi: erc20Abi,
            functionName: "approve",
            args: [network.whosRight!, fee],
          });
        }
        setStep("paying");
        await action();
        setStep("done");
        await me.refetch();
        return true;
      } catch (e) {
        setStep("idle");
        setError(friendlyError(e));
        await me.refetch();
        return false;
      }
    },
    [me, sendTx, sym],
  );

  return { pay, step, error, setError, shortfall, needsClaim, me };
}

export const PAY_STEP_LABEL: Record<PayStep, string> = {
  idle: "",
  claiming: network.testnet ? "Getting test G$…" : "Claiming today's G$…",
  approving: "Approving the fee…",
  paying: "Paying…",
  done: "Paid",
};
