import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { celo, celoSepolia } from "viem/chains";
import { network } from "./network";

// Only the configured network is a supported chain; a transport is listed for both so the types line up.
export const wagmiConfig = createConfig({
  chains: [network.chain],
  transports: { [celo.id]: http(), [celoSepolia.id]: http() },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
