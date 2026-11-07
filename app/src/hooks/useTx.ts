"use client";

import { useCallback } from "react";
import { useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Abi, ContractFunctionArgs, ContractFunctionName, TransactionReceipt } from "viem";
import { network } from "@/lib/network";
import { wagmiConfig } from "@/lib/wagmi";

type WriteParams<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">> = {
  address: `0x${string}`;
  abi: abi;
  functionName: fn;
  args?: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>;
  value?: bigint;
};

/** Sends a contract call on the app's network and waits for it to be mined. Throws if it reverts. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  return useCallback(
    async <abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">>(
      p: WriteParams<abi, fn>,
    ): Promise<TransactionReceipt> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hash = await writeContractAsync({ ...(p as any), chainId: network.chain.id });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: network.chain.id });
      if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
      return receipt;
    },
    [writeContractAsync],
  );
}
