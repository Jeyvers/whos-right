"use client";

import { encodeAbiParameters, keccak256, bytesToHex, type Address, type Hex } from "viem";
import { dataKey } from "./network";

/**
 * A juror's secret vote key (salt). Preferred: derived from a wallet signature over a fixed message, so the same
 * wallet gets the same key on any device and nobody else can know it. Fallback (wallets whose signatures aren't
 * repeatable): a random key stored in this browser and backed up on our server, which means the operator could
 * work out the vote before reveal. The juror is told when the fallback is used.
 */
export function voteKeyMessage(caseId: bigint, brand: string = VOTE_KEY_BRAND): string {
  return `${brand} private vote key\nCase ${caseId} on ${dataKey}\n\nSigning is free. It creates the secret key that hides your vote until the reveal.`;
}

const VOTE_KEY_BRAND = "Rest My Case";
/**
 * The app's name before the rename. Votes committed before it were keyed with this wording, so reveal tries it last.
 * Safe to delete once no case committed under the old name is still waiting on reveals.
 */
export const LEGACY_VOTE_KEY_BRAND = "Who's Right?";

export function commitmentOf(caseId: bigint, juror: Address, vote: number, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint8" }, { type: "bytes32" }],
      [caseId, juror, vote, salt],
    ),
  );
}

const lsKey = (caseId: bigint, juror: Address) => `wr:salt:${dataKey}:${caseId}:${juror.toLowerCase()}`;

export function loadLocalSalt(caseId: bigint, juror: Address): Hex | null {
  try {
    return localStorage.getItem(lsKey(caseId, juror)) as Hex | null;
  } catch {
    return null;
  }
}
export function saveLocalSalt(caseId: bigint, juror: Address, salt: Hex) {
  try {
    localStorage.setItem(lsKey(caseId, juror), salt);
  } catch {}
}

export const saltFromSignature = (sig: Hex): Hex => keccak256(sig);
export const randomSalt = (): Hex => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
