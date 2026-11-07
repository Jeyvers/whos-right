import { encodeAbiParameters, keccak256, type Hex } from "viem";

/**
 * The on-chain content hash of a side: keccak256(abi.encode(salt, title, body)). A random 32-byte salt is mixed in
 * so short texts can't be guessed from the public hash. The title is A's case title ("" for B's side), so it is
 * covered too and can't be swapped after paying. The app only shows text whose hash matches the chain.
 */
export function contentHash(salt: Hex, title: string, body: string): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "string" }, { type: "string" }], [salt, title, body]));
}

export const MAX_SIDE_LENGTH = 500; // short enough to read at a glance in the feed
export const MIN_SIDE_LENGTH = 20;
export const MAX_TITLE_LENGTH = 80;
export const MIN_TITLE_LENGTH = 5;
