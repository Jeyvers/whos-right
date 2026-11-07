import type { ChainCase } from "./cases";

export type Action = "requestJury" | "drawJury" | "finalize" | "cancelExpired";

/**
 * What, if anything, should happen to this case now. Mirrors the contract's own checks.
 * `poolReady`: the active jury pool is at least minPoolSize. Requesting a jury with a short pool makes the contract
 * refund the case on the spot, so the keeper WAITS instead and only refunds if the draw window runs out.
 */
export function decide(c: ChainCase, jurorCount: number, randomnessReady: boolean, now: bigint, poolReady = true): Action | null {
  switch (c.status) {
    case 1: // Open
      return now > c.joinDeadline ? "cancelExpired" : null;
    case 2: // Joined
      if (now > c.drawDeadline) return "cancelExpired";
      return poolReady ? "requestJury" : null;
    case 3: // Drawing
      if (now > c.drawDeadline) return "cancelExpired";
      return randomnessReady ? "drawJury" : null;
    case 4: {
      // Voting
      const revealOpen = now > c.commitDeadline || c.commits === jurorCount;
      const canFinalize = now > c.revealDeadline || (revealOpen && c.reveals === c.commits);
      return canFinalize ? "finalize" : null;
    }
    default:
      return null;
  }
}
