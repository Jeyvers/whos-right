import type { Address } from "viem";
import { celo, celoSepolia } from "viem/chains";

/**
 * One network per deployment, chosen by NEXT_PUBLIC_NETWORK.
 *
 * Testnet stand-ins (tG$ with a faucet, self-verify Identity, insecure randomness) live ONLY in the
 * `celo-sepolia` entry. The mainnet entry has no `testnet` field, so code that needs a stand-in must
 * check `network.testnet` and cannot reach one on mainnet.
 */
export type NetworkName = "celo-sepolia" | "celo";

type TestnetStandIns = {
  /** TestnetGoodDollar: worthless tG$ with a public faucet(). */
  faucetToken: Address;
  /** TestnetIdentity: anyone can call verifyMe(). */
  selfVerifyIdentity: Address;
};

export type NetworkConfig = {
  name: NetworkName;
  label: string;
  chain: typeof celo | typeof celoSepolia;
  /** WhosRight contract. Undefined until deployed on this network. */
  whosRight: Address | undefined;
  /** The G$ token the contract charges in. */
  goodDollar: Address;
  /** The Identity contract the contract checks. */
  identity: Address;
  /** Display symbol for the fee token. */
  tokenSymbol: string;
  testnet?: TestnetStandIns;
};

const NETWORKS: Record<NetworkName, NetworkConfig> = {
  "celo-sepolia": {
    name: "celo-sepolia",
    label: "Celo Sepolia (test)",
    chain: celoSepolia,
    whosRight: "0xCbF0AD90F0F48BBf5367Be07FED166d07bCE3f6b",
    goodDollar: "0xB4e8a6c837744A21b6d94C08FDeB3cf4E0696a36",
    identity: "0x71386420228BF609FA916EE1B676f3A81c803B2F",
    tokenSymbol: "tG$",
    testnet: {
      faucetToken: "0xB4e8a6c837744A21b6d94C08FDeB3cf4E0696a36",
      selfVerifyIdentity: "0x71386420228BF609FA916EE1B676f3A81c803B2F",
    },
  },
  celo: {
    name: "celo",
    label: "Celo",
    chain: celo,
    whosRight: undefined, // set after the approved mainnet deploy (Phase 6)
    goodDollar: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
    identity: "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42",
    tokenSymbol: "G$",
  },
};

function resolveNetwork(): NetworkConfig {
  const name = (process.env.NEXT_PUBLIC_NETWORK ?? "celo-sepolia") as NetworkName;
  const config = NETWORKS[name];
  if (!config) throw new Error(`Unknown NEXT_PUBLIC_NETWORK "${name}"`);
  if (config.chain.id === celo.id && config.testnet) {
    throw new Error("Testnet stand-ins must never be configured on Celo mainnet");
  }
  return config;
}

export const network = resolveNetwork();
