import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { whosRightAbi } from "@/lib/abi/whosRight";
import type { ChainCase } from "@/lib/cases";
import { network } from "@/lib/network";

export const publicClient = createPublicClient({ chain: network.chain, transport: http() });

function contract(): Address {
  if (!network.whosRight) throw new Error(`WhosRight is not deployed on ${network.label}`);
  return network.whosRight;
}

export async function readCase(caseId: bigint): Promise<ChainCase> {
  return (await publicClient.readContract({
    address: contract(),
    abi: whosRightAbi,
    functionName: "getCase",
    args: [caseId],
  })) as ChainCase;
}

export async function readJurors(caseId: bigint): Promise<readonly Address[]> {
  return publicClient.readContract({ address: contract(), abi: whosRightAbi, functionName: "getJurors", args: [caseId] });
}
