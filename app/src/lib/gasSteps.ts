/**
 * Actions the gas top-up will pay for, with a generous gas-unit budget each (Celo Sepolia measured ~2x lower).
 * The server prices a request ONLY from this list; the browser can't name an amount.
 */
export const GAS_BUDGET = {
  verifyMe: 120_000n, // testnet stand-in only
  faucet: 100_000n, // testnet stand-in only
  approve: 80_000n,
  transfer: 90_000n, // sending G$ anywhere (always confirmed by the user)
  openCase: 400_000n,
  joinCase: 400_000n,
  joinPool: 250_000n,
  leavePool: 120_000n,
  commitVote: 150_000n,
  revealVote: 150_000n,
  withdraw: 120_000n,
  cancelExpired: 200_000n,
  finalize: 450_000n,
  drawJury: 1_200_000n,
} as const;

export type GasStep = keyof typeof GAS_BUDGET;
export const TESTNET_ONLY_STEPS: GasStep[] = ["verifyMe", "faucet"];

export function isGasStep(s: unknown): s is GasStep {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(GAS_BUDGET, s);
}
