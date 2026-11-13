"use client";

import { useAccount, useBalance, useReadContracts } from "wagmi";
import { erc20Abi, identityAbi } from "@/lib/abi/tokens";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { ZERO_ADDRESS } from "@/lib/cases";
import { network } from "@/lib/network";

/** Everything about the signed-in wallet that the screens need. */
export function useMe() {
  const { address } = useAccount();
  const wr = network.restMyCase;
  const enabled = Boolean(address && wr);
  const who = address ?? ZERO_ADDRESS;
  const reads = useReadContracts({
    contracts: [
      { address: network.goodDollar, abi: erc20Abi, functionName: "balanceOf", args: [who] },
      { address: network.goodDollar, abi: erc20Abi, functionName: "allowance", args: [who, wr ?? ZERO_ADDRESS] },
      { address: network.identity, abi: identityAbi, functionName: "getWhitelistedRoot", args: [who] },
      { address: wr, abi: restMyCaseAbi, functionName: "owed", args: [who] },
      { address: wr, abi: restMyCaseAbi, functionName: "activeEntryOfWallet", args: [who] },
    ],
    allowFailure: false,
    query: { enabled, refetchInterval: 15_000 },
  });
  const gas = useBalance({ address, chainId: network.chain.id, query: { enabled, refetchInterval: 15_000 } });

  const [gBalance, allowance, root, owed, poolEntry] = reads.data ?? [];
  return {
    address,
    ready: Boolean(reads.data) && gas.data !== undefined,
    gBalance: gBalance ?? 0n,
    allowance: allowance ?? 0n,
    verified: Boolean(root && root !== ZERO_ADDRESS),
    owed: owed ?? 0n,
    inPool: Boolean(poolEntry && poolEntry > 0n),
    gasBalance: gas.data?.value ?? 0n,
    refetch: async () => {
      await Promise.all([reads.refetch(), gas.refetch()]);
    },
  };
}
