"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { getBalance, getGasPrice } from "wagmi/actions";
import { GAS_BUDGET, type GasStep } from "@/lib/gasSteps";
import { network } from "@/lib/network";
import { wagmiConfig } from "@/lib/wagmi";
import { useAuthFetch } from "./useAuthFetch";

type TopupResponse = { sent: boolean; reason?: string; message?: string };

/**
 * Makes sure the wallet has enough CELO for `steps`. Checks locally first; only asks the server for a top-up
 * when short. Throws a plain-language error if the top-up is refused (limits, not verified, unavailable).
 */
export function useEnsureGas() {
  const { address } = useAccount();
  const authFetch = useAuthFetch();
  return useCallback(
    async (steps: GasStep[]) => {
      if (!address || steps.length === 0) return;
      const [balance, gasPrice] = await Promise.all([
        getBalance(wagmiConfig, { address, chainId: network.chain.id }),
        getGasPrice(wagmiConfig, { chainId: network.chain.id }),
      ]);
      const units = steps.reduce((sum, s) => sum + GAS_BUDGET[s], 0n);
      if (balance.value >= (units * gasPrice * 12n) / 10n) return;
      const res = await authFetch<TopupResponse>("/api/gas/topup", {
        method: "POST",
        body: JSON.stringify({ address, steps }),
      });
      if (!res.sent && res.reason !== "enough") throw new Error(res.message ?? "You need a little CELO for network fees.");
    },
    [address, authFetch],
  );
}
