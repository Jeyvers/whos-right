"use client";

import { useCallback } from "react";
import { useAccount, usePublicClient, useReadContracts, useWalletClient } from "wagmi";
import { ubiSchemeAbi } from "@/lib/abi/ubi";
import { ZERO_ADDRESS } from "@/lib/cases";
import { claimState, type ClaimState } from "@/lib/claim";
import { network } from "@/lib/network";
import { useMe } from "./useMe";
import { useTx } from "./useTx";

/** tG$ the testnet faucet gives per call; the stand-in for "today's claim" on Celo Sepolia. */
export const TESTNET_FAUCET_AMOUNT = 10_000n * 10n ** 18n;

/**
 * Today's GoodDollar claim for the signed-in wallet (mainnet), read straight from GoodDollar's UBIScheme:
 * whether they're verified, how much they can claim now, and when the next claim opens. `claim()` sends the claim
 * through our normal transaction path (gas top-up, confirmations, friendly errors).
 */
export function useDailyClaim() {
  const me = useMe();
  const { address } = useAccount();
  const sendTx = useTx();
  const ubi = network.ubiScheme;
  const reads = useReadContracts({
    contracts: [
      { address: ubi, abi: ubiSchemeAbi, functionName: "checkEntitlement", args: [address ?? ZERO_ADDRESS] },
      { address: ubi, abi: ubiSchemeAbi, functionName: "periodStart" },
      { address: ubi, abi: ubiSchemeAbi, functionName: "currentDay" },
    ],
    allowFailure: false,
    query: { enabled: Boolean(ubi && address), refetchInterval: 60_000 },
  });

  let state: ClaimState;
  if (network.testnet) state = { kind: "testnet", amount: TESTNET_FAUCET_AMOUNT };
  else if (!me.ready || !reads.data) state = me.ready && !me.verified ? { kind: "not_verified" } : { kind: "loading" };
  else {
    const [entitlement, periodStart, currentDay] = reads.data;
    state = claimState({ verified: me.verified, entitlement, periodStart, currentDay });
  }

  const claim = useCallback(async () => {
    if (!ubi) throw new Error("Daily claims aren't available on this network.");
    await sendTx({ address: ubi, abi: ubiSchemeAbi, functionName: "claim" });
    await Promise.all([reads.refetch(), me.refetch()]);
  }, [ubi, sendTx, reads, me]);

  return { state, claim, refetch: reads.refetch };
}

/**
 * GoodDollar face verification (mainnet). Builds the official link with GoodDollar's citizen SDK, signed by the
 * user's wallet, and sends them there; they come back to `returnTo` when done.
 */
export function useGoodDollarVerify() {
  const publicClient = usePublicClient({ chainId: network.chain.id });
  const { data: walletClient } = useWalletClient({ chainId: network.chain.id });
  return useCallback(
    async (returnTo: string) => {
      if (!publicClient || !walletClient) throw new Error("Your wallet isn't ready yet. Try again in a moment.");
      if (network.testnet) throw new Error("Test network: use the Verify (test) button instead.");
      const { IdentitySDK, SupportedChains } = await import("@goodsdks/citizen-sdk");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the SDK's viem client generics differ from wagmi's
      const sdk = await IdentitySDK.init({ publicClient: publicClient as any, walletClient: walletClient as any, env: "production" });
      const link = await sdk.generateFVLink(false, returnTo, SupportedChains.CELO);
      window.location.href = link;
    },
    [publicClient, walletClient],
  );
}
