"use client";

import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { useCallback } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { encodeFunctionData, type Abi, type ContractFunctionArgs, type ContractFunctionName, type TransactionReceipt } from "viem";
import { network } from "@/lib/network";
import { isGasStep } from "@/lib/gasSteps";
import { maySignSilently } from "@/lib/silentSigning";
import { wagmiConfig } from "@/lib/wagmi";
import { useEnsureGas } from "./useEnsureGas";

type WriteParams<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">> = {
  address: `0x${string}`;
  abi: abi;
  functionName: fn;
  args?: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>;
  value?: bigint;
  /** Set when the caller already ensured gas for a multi-step plan. */
  gasEnsured?: boolean;
};

/**
 * Sends a contract call on the app's network and waits for it to be mined. Throws if it reverts.
 * Built-in (Privy) wallet + a call allowed by `maySignSilently` (testnet only): no pop-up.
 * Everything else goes through the normal path, where Privy (or the user's own wallet) asks to confirm.
 */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const ensureGas = useEnsureGas();

  return useCallback(
    async <abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">>(
      p: WriteParams<abi, fn>,
    ): Promise<TransactionReceipt> => {
      const fn = p.functionName as string;
      if (!p.gasEnsured && isGasStep(fn)) await ensureGas([fn]);
      const builtIn = wallets.some(
        (w) => w.walletClientType === "privy" && address && w.address.toLowerCase() === address.toLowerCase(),
      );
      const silent =
        builtIn &&
        maySignSilently({ address: p.address, functionName: p.functionName as string, args: p.args as readonly unknown[], value: p.value });

      let hash: `0x${string}`;
      if (silent) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = encodeFunctionData({ abi: p.abi, functionName: p.functionName, args: p.args } as any);
        ({ hash } = await sendTransaction(
          { to: p.address, data, value: p.value ?? 0n, chainId: network.chain.id },
          { address, uiOptions: { showWalletUIs: false } },
        ));
      } else {
        const { gasEnsured, ...call } = p;
        void gasEnsured;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hash = await writeContractAsync({ ...(call as any), chainId: network.chain.id });
      }
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: network.chain.id });
      if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
      return receipt;
    },
    [writeContractAsync, sendTransaction, wallets, address, ensureGas],
  );
}
