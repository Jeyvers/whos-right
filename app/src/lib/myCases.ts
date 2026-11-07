import { sameAddress, type ChainCase } from "./cases";

/** How the signed-in person took part in a case. */
export type MyRole = "opened" | "joined" | "judged";

/**
 * The status shown on "My cases". Coarser than the on-chain status in places
 * (Joined + Drawing are both "drawing") and finer in others: a Refunded case is
 * split by why, and a case past its deadline reads "expired" before anyone has
 * called cancelExpired.
 */
export type MyStage = "waiting" | "drawing" | "voting" | "resolved" | "tie" | "expired" | "refunded";

export const STAGE_LABEL: Record<MyStage, string> = {
  waiting: "Waiting for the other person",
  drawing: "Drawing the jury",
  voting: "Voting",
  resolved: "Resolved",
  tie: "Tie",
  expired: "Expired",
  refunded: "Refunded",
};

/** WhosRight.RefundReason values that mean "a deadline ran out". */
const EXPIRED_REASONS = new Set([1 /* NotJoined */, 4 /* DrawTimeout */]);
const TIE_REASON = 6;

export function myStage(c: Pick<ChainCase, "status" | "refundReason" | "joinDeadline" | "drawDeadline">, nowSec: number): MyStage {
  switch (c.status) {
    case 1:
      return nowSec > Number(c.joinDeadline) ? "expired" : "waiting";
    case 2:
    case 3:
      return nowSec > Number(c.drawDeadline) ? "expired" : "drawing";
    case 4:
      return "voting";
    case 5:
      return "resolved";
    case 6:
      if (c.refundReason === TIE_REASON) return "tie";
      return EXPIRED_REASONS.has(c.refundReason) ? "expired" : "refunded";
    default:
      return "waiting";
  }
}

/** The person's role, or null if they took no part. A party outranks a juror (the contract never seats both). */
export function myRole(c: Pick<ChainCase, "partyA" | "partyB">, me: string, onJury: boolean): MyRole | null {
  if (sameAddress(c.partyA, me)) return "opened";
  if (sameAddress(c.partyB, me)) return "joined";
  return onJury ? "judged" : null;
}

/**
 * What this case credited to the person's withdrawable balance, mirroring the
 * contract: a refund returns each party's own deposit; a verdict splits the pot
 * evenly among jurors who revealed (the first few get 1 wei of remainder,
 * ignored here). Everything else credits nothing.
 *
 * The contract keeps one `owed` balance per wallet, so this is what the case
 * added — not proof it's still unwithdrawn.
 */
export function myCredit(
  c: Pick<ChainCase, "status" | "depositA" | "depositB" | "reveals">,
  role: MyRole,
  revealed: boolean,
): bigint {
  if (c.status === 6) {
    if (role === "opened") return c.depositA;
    if (role === "joined") return c.depositB;
    return 0n;
  }
  if (c.status === 5 && role === "judged" && revealed && c.reveals > 0) {
    return (c.depositA + c.depositB) / BigInt(c.reveals);
  }
  return 0n;
}
