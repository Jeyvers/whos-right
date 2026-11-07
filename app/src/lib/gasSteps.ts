/**
 * Actions the gas top-up will pay for, with a gas-unit budget each.
 * The server prices a request ONLY from this list; the browser can't name an amount.
 */
export const GAS_BUDGET = {
  // ~1.3x gas measured on Celo Sepolia (2026-11-07); the server adds a further 50% for price moves.
  verifyMe: 60_000n, // testnet stand-in only (measured 47k)
  faucet: 70_000n, // testnet stand-in only (51k)
  approve: 60_000n, // 47k
  claim: 300_000n, // GoodDollar daily UBI claim (mainnet)
  transfer: 70_000n, // sending G$ anywhere, always confirmed by the user (52k)
  openCase: 340_000n, // 258k
  joinCase: 360_000n,
  joinPool: 250_000n,
  leavePool: 100_000n, // 75k
  commitVote: 120_000n,
  revealVote: 140_000n,
  withdraw: 90_000n,
  cancelExpired: 160_000n, // refunds
  finalize: 270_000n, // 120k-203k
  drawJury: 460_000n, // 353k
} as const;

export type GasStep = keyof typeof GAS_BUDGET;
export const TESTNET_ONLY_STEPS: GasStep[] = ["verifyMe", "faucet"];

export function isGasStep(s: unknown): s is GasStep {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(GAS_BUDGET, s);
}
