import type { Hex } from "viem";
import { dataKey } from "./network";

/** The invite key lives only in A's browser (and the link A shares). We never send it to the server. */
const key = (caseId: bigint | string) => `wr:invite:${dataKey}:${caseId}`;

export function saveInviteKey(caseId: bigint | string, pk: Hex) {
  try {
    localStorage.setItem(key(caseId), pk);
  } catch {}
}

export function loadInviteKey(caseId: bigint | string): Hex | null {
  try {
    return localStorage.getItem(key(caseId)) as Hex | null;
  } catch {
    return null;
  }
}

export function inviteLink(origin: string, caseId: bigint | string, pk: Hex) {
  return `${origin}/join/${caseId}#k=${pk}`;
}
