import { formatUnits } from "viem";

/** Formats an 18-decimal G$ amount for display, e.g. 100000000000000000000n -> "100". */
export function formatG(amount: bigint): string {
  const n = Number(formatUnits(amount, 18));
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
