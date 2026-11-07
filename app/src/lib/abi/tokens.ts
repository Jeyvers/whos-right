import { erc20Abi } from "viem";

export { erc20Abi };

/** Identity: GoodDollar on mainnet, TestnetIdentity on Celo Sepolia. */
export const identityAbi = [
  {
    type: "function",
    name: "getWhitelistedRoot",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** TESTNET ONLY stand-ins. Never call on mainnet (network.testnet is undefined there). */
export const testnetFaucetAbi = [
  { type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;
export const testnetIdentityAbi = [
  { type: "function", name: "verifyMe", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;
