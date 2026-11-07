import "server-only";
import { identityAbi } from "@/lib/abi/tokens";
import { ZERO_ADDRESS } from "@/lib/cases";
import { network } from "@/lib/network";
import { publicClient } from "./chain";

/** The verified identity root behind any of these wallets (lowercased), or null if none is verified. */
export async function verifiedPerson(wallets: string[]): Promise<{ person: string; wallet: string } | null> {
  for (const w of wallets) {
    const root = await publicClient.readContract({
      address: network.identity,
      abi: identityAbi,
      functionName: "getWhitelistedRoot",
      args: [w as `0x${string}`],
    });
    if (root !== ZERO_ADDRESS) return { person: root.toLowerCase(), wallet: w };
  }
  return null;
}
