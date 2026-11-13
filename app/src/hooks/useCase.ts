"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { ZERO_ADDRESS, type ChainCase } from "@/lib/cases";
import { network } from "@/lib/network";

export type CaseText = {
  mode: number;
  title: string | null;
  access: "party" | "juror" | "invite" | "public" | "none";
  isPublic: boolean;
  hidden: boolean;
  removalRequested: boolean;
  sideA: string | null;
  sideB: string | null;
  crowd: { a: number; b: number } | null; // hidden until the official verdict
  crowdTotal: number;
  myCrowdVote: number | null;
};

/** On-chain case + jurors + my vote, refreshed every 8s. */
export function useCase(caseId: bigint | null) {
  const { address } = useAccount();
  const wr = network.restMyCase;
  const id = caseId ?? 0n;
  const q = useReadContracts({
    contracts: [
      { address: wr, abi: restMyCaseAbi, functionName: "getCase", args: [id] },
      { address: wr, abi: restMyCaseAbi, functionName: "getJurors", args: [id] },
      { address: wr, abi: restMyCaseAbi, functionName: "getJurorVote", args: [id, address ?? ZERO_ADDRESS] },
      { address: wr, abi: restMyCaseAbi, functionName: "isRandomnessReady", args: [id] },
    ],
    allowFailure: false,
    query: { enabled: Boolean(wr && caseId), refetchInterval: 8_000 },
  });
  const [c, jurors, myVote, randomnessReady] = q.data ?? [];
  return {
    c: c as ChainCase | undefined,
    jurors: (jurors ?? []) as readonly `0x${string}`[],
    myVote,
    randomnessReady: Boolean(randomnessReady),
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Case text from the server, which applies the access rules. `inviteSig` proves the invite link holder. */
export function useCaseText(caseId: bigint | null, opts: { inviteSig?: string; enabled?: boolean } = {}) {
  const { authenticated, getAccessToken, ready } = usePrivy();
  return useQuery({
    queryKey: ["case-text", caseId?.toString(), authenticated, opts.inviteSig],
    enabled: Boolean(caseId) && ready && (opts.enabled ?? true),
    refetchInterval: 20_000,
    queryFn: async (): Promise<CaseText> => {
      const headers: Record<string, string> = {};
      const token = authenticated ? await getAccessToken() : null;
      if (token) headers.authorization = `Bearer ${token}`;
      if (opts.inviteSig) headers["x-invite-signature"] = opts.inviteSig;
      const res = await fetch(`/api/cases/${caseId}`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load the case.");
      return json;
    },
  });
}
