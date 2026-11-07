import type { Address } from "viem";

export const SPEED = { Standard: 0, Fast: 1 } as const;
export type SpeedValue = (typeof SPEED)[keyof typeof SPEED];

/** Mirrors WhosRight.Status */
export const STATUS = ["None", "Open", "Joined", "Drawing", "Voting", "Resolved", "Refunded"] as const;
export type StatusName = (typeof STATUS)[number];

/** Mirrors WhosRight.RefundReason */
export const REFUND_REASON: Record<number, string> = {
  1: "The other person didn't join in time.",
  2: "Not enough jurors were in the pool.",
  3: "Not enough eligible jurors could be drawn.",
  4: "The jury couldn't be drawn in time.",
  5: "No juror revealed a vote.",
  6: "The jury was split evenly.",
};

export const VOTE = { A: 1, B: 2 } as const;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type ChainCase = {
  partyA: Address;
  rootA: Address;
  partyB: Address;
  rootB: Address;
  inviteSigner: Address;
  speed: number;
  status: number;
  verdict: number;
  refundReason: number;
  contentA: `0x${string}`;
  contentB: `0x${string}`;
  fee: bigint;
  commitWindow: bigint;
  revealWindow: bigint;
  depositA: bigint;
  depositB: bigint;
  joinDeadline: bigint;
  drawDeadline: bigint;
  commitDeadline: bigint;
  revealDeadline: bigint;
  snapshotBlock: bigint;
  snapshotPoolLength: bigint;
  randomnessId: bigint;
  commits: number;
  reveals: number;
  votesA: number;
  votesB: number;
};

export function statusName(c: Pick<ChainCase, "status">): StatusName {
  return STATUS[c.status] ?? "None";
}

export function sameAddress(a?: string, b?: string): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** Seconds -> "3h 12m" style countdown text. */
export function timeLeft(deadline: bigint, nowSec: number): string {
  const s = Number(deadline) - nowSec;
  if (s <= 0) return "time's up";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}
