"use client";

import { useCallback, useState } from "react";
import { erc20Abi, testnetFaucetAbi, testnetIdentityAbi } from "@/lib/abi/tokens";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import type { GasStep } from "@/lib/gasSteps";
import { network } from "@/lib/network";
import { useEnsureGas } from "./useEnsureGas";
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

export type PayStep = "idle" | "preparing" | "gas" | "verifying" | "claiming" | "approving" | "paying" | "done";

export type PayPlan = {
  verify: boolean;
  claim: boolean;
  approve: boolean;
  shortfall: bigint;
  /** Plain list of what one tap will do, for the summary shown before paying. */
  summary: string[];
};

/**
 * "Use today's claim" payment, in ONE tap:
 *   (testnet: verify) -> claim (only if needed) -> approve the exact fee (only if needed) -> the pay action.
 * Gas for the whole plan is topped up once, before the first step (falling back to per-step top-ups).
 * Never assumes one claim covers the fee: if balance + claim is still short, it stops with a clear message.
 */
export function usePayFee() {
  const me = useMe();
  const sendTx = useTx();
  const ensureGas = useEnsureGas();
  const [step, setStep] = useState<PayStep>("idle");
  const [error, setError] = useState<string>();
  const sym = network.tokenSymbol;

  const plan = useCallback(
    (fee: bigint, actionLabel: string): PayPlan => {
      const verify = !me.verified && Boolean(network.testnet);
      const claim = me.gBalance < fee;
      const available = me.gBalance + (claim ? todaysClaim() : 0n);
      const shortfall = available >= fee ? 0n : fee - available;
      const approve = me.allowance < fee;
      const summary = [
        ...(verify ? ["Verify you (test)"] : []),
        ...(claim ? [network.testnet ? "Get free test G$" : "Claim today's G$"] : []),
        ...(approve ? [`Approve exactly ${formatG(fee)} ${sym}`] : []),
        actionLabel,
      ];
      return { verify, claim, approve, shortfall, summary };
    },
    [me.verified, me.gBalance, me.allowance, sym],
  );

  const pay = useCallback(
    async (fee: bigint, action: () => Promise<void>, actionStep: GasStep): Promise<boolean> => {
      setError(undefined);
      try {
        const p = plan(fee, "");
        if (!me.verified && !network.testnet) throw new Error("Verify you're a real person first.");
        if (p.shortfall > 0n) {
          throw new Error(
            `You need ${formatG(fee)} ${sym}. You have ${formatG(me.gBalance)} ${sym}` +
              (todaysClaim() > 0n ? ` plus ${formatG(todaysClaim())} ${sym} from today's claim.` : ", and no claim left today.") +
              " Pick Standard or come back after your next claim.",
          );
        }

        const steps: GasStep[] = [
          ...(p.verify ? (["verifyMe"] as const) : []),
          ...(p.claim && network.testnet ? (["faucet"] as const) : []),
          ...(p.approve ? (["approve"] as const) : []),
          actionStep,
        ];
        setStep("gas");
        // One top-up for the whole plan when possible. If it's refused (the first-time testnet plan can exceed
        // the per-request cap, or gas prices spiked), each step below asks for its own gas instead; a refusal
        // that also applies per step (daily limit, not verified) still surfaces there with its own message.
        const upfront = await ensureGas(steps).then(
          () => true,
          () => false,
        );

        if (p.verify && network.testnet) {
          setStep("verifying");
          await sendTx({ address: network.testnet.selfVerifyIdentity, abi: testnetIdentityAbi, functionName: "verifyMe", gasEnsured: upfront });
        }
        if (p.claim && network.testnet) {
          setStep("claiming");
          await sendTx({ address: network.testnet.faucetToken, abi: testnetFaucetAbi, functionName: "faucet", gasEnsured: upfront });
        }
        if (p.approve) {
          setStep("approving");
          await sendTx({
            address: network.goodDollar,
            abi: erc20Abi,
            functionName: "approve",
            args: [network.whosRight!, fee], // exact fee, never unlimited
            gasEnsured: upfront,
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
    [me, sendTx, ensureGas, plan, sym],
  );

  /** Call the instant Pay is tapped, so the button reacts before any network work starts. */
  const begin = useCallback(() => {
    setError(undefined);
    setStep("preparing");
  }, []);
  /** Back to idle with an error, for failures before `pay` runs (e.g. saving the side). */
  const fail = useCallback((message: string) => {
    setStep("idle");
    setError(message);
  }, []);

  return { pay, plan, step, error, setError, begin, fail, me };
}

export const PAY_STEP_LABEL: Record<PayStep, string> = {
  idle: "",
  preparing: "Saving your side…",
  gas: "Getting ready…",
  verifying: "Verifying you…",
  claiming: network.testnet ? "Getting test G$…" : "Claiming today's G$…",
  approving: "Approving the fee…",
  paying: "Paying…",
  done: "Paid",
};
