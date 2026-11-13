import { fallback, http, type Address } from "viem";
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
  /** RestMyCase contract. Undefined until deployed on this network. */
  restMyCase: Address | undefined;
  /**
   * Earlier contracts on this network that may still hold refunds or juror pay. The app only offers withdraw() on
   * them; cases, the pool and new fees all use `restMyCase`.
   */
  legacyContracts?: Address[];
  /** The G$ token the contract charges in. */
  goodDollar: Address;
  /** The Identity contract the contract checks. */
  identity: Address;
  /** GoodDollar's UBIScheme (daily claim). Mainnet only; on testnet the tG$ faucet stands in. */
  ubiScheme?: Address;
  /** RPC endpoints, tried in order (public RPCs go down; never rely on just one). */
  rpcUrls: string[];
  /** Display symbol for the fee token. */
  tokenSymbol: string;
  testnet?: TestnetStandIns;
};

const NETWORKS: Record<NetworkName, NetworkConfig> = {
  "celo-sepolia": {
    name: "celo-sepolia",
    label: "Celo Sepolia (test)",
    chain: celoSepolia,
    restMyCase: "0x94a36d3437daA547c25c4Bf41907dD891e196d14", // v2 (one-sided cases), deployed 2026-11-07
    goodDollar: "0xB4e8a6c837744A21b6d94C08FDeB3cf4E0696a36",
    identity: "0x71386420228BF609FA916EE1B676f3A81c803B2F",
    rpcUrls: [
      "https://forno.celo-sepolia.celo-testnet.org",
      "https://celo-sepolia.drpc.org",
      "https://rpc.ankr.com/celo_sepolia",
    ],
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
    restMyCase: "0xCbF0AD90F0F48BBf5367Be07FED166d07bCE3f6b", // RestMyCase, min pool 5, deployed 2026-11-13, block 82683084
    // The first mainnet deployment (named WhosRight, min pool 11). Holds refunds from cases #1-2 until withdrawn.
    legacyContracts: ["0x71386420228BF609FA916EE1B676f3A81c803B2F"],
    goodDollar: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
    identity: "0xC361A6E67822a0EDc17D899227dd9FC50BD62F42",
    ubiScheme: "0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1", // GoodDollar UBISchemeV2 on Celo (citizen-sdk chainConfigs)
    rpcUrls: ["https://forno.celo.org", "https://celo.drpc.org", "https://rpc.ankr.com/celo"],
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

/**
 * Key for everything stored per CONTRACT (case text, flags, votes, crowd votes, keeper progress, invite keys):
 * the network plus the RestMyCase address. A redeploy starts at case #1 again, so this keeps a new contract's
 * cases from ever mixing with an old one's. Per-wallet things (gas top-up limits, keeper spend) stay per network.
 */
export const dataKey = `${network.name}:${(network.restMyCase ?? "undeployed").toLowerCase()}`;

/**
 * viem transport across the network's public RPCs. `rank` keeps re-measuring them and prefers the fastest, most
 * reliable one, so a slow or flaky node (forno has had outages) doesn't stall every call.
 */
export function rpcTransport() {
  return fallback(
    network.rpcUrls.map((url) => http(url, { retryCount: 1, timeout: 10_000 })),
    { rank: { interval: 30_000, sampleCount: 5, timeout: 4_000 } },
  );
}
