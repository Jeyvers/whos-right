import "server-only";
import { createPublicClient, type Address } from "viem";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import type { ChainCase } from "@/lib/cases";
import { network, rpcTransport } from "@/lib/network";

export const publicClient = createPublicClient({ chain: network.chain, transport: rpcTransport() });

function contract(): Address {
  if (!network.restMyCase) throw new Error(`RestMyCase is not deployed on ${network.label}`);
  return network.restMyCase;
}

export async function readCase(caseId: bigint): Promise<ChainCase> {
  return (await publicClient.readContract({
    address: contract(),
    abi: restMyCaseAbi,
    functionName: "getCase",
    args: [caseId],
  })) as ChainCase;
}

export async function readJurors(caseId: bigint): Promise<readonly Address[]> {
  return publicClient.readContract({ address: contract(), abi: restMyCaseAbi, functionName: "getJurors", args: [caseId] });
}
