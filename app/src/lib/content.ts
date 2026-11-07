import { encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * The on-chain content hash of a side's text. A random 32-byte salt is mixed in so short texts can't be guessed
 * from the public hash. The app only displays text whose (salt, text) hashes to the value stored on-chain.
 */
export function contentHash(salt: Hex, text: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }], [salt, text]));
}

export const MAX_SIDE_LENGTH = 500; // short enough to read at a glance in the feed
export const MIN_SIDE_LENGTH = 20;
