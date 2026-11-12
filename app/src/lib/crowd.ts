/** Shared shapes for the public feed and crowd votes (client + server). */

export type CrowdTally = { a: number; b: number };

export type FeedItem = {
  caseId: string;
  status: number; // on-chain status: 2 Joined, 3 Drawing, 4 Voting, 5 Resolved, 6 Refunded
  speed: number;
  mode: number; // 0 two-sided, 1 one-sided (vote 1 = Right, 2 = Wrong)
  title: string;
  fee: string; // wei
  verdict: number; // 1 = A, 2 = B (when status 5)
  votesA: number;
  votesB: number;
  jurorCount: number;
  commits: number;
  reveals: number;
  drawDeadline: number;
  commitDeadline: number;
  revealDeadline: number;
  sideA: string;
  sideB: string | null; // null for one-sided cases
  /**
   * Like a Twitter poll: visible to people who've voted (and to everyone once the verdict is in). Parties and
   * jurors can't vote in it, so they only see it with the verdict and the jury can't be swayed.
   */
  crowd: CrowdTally | null;
  crowdTotal: number;
  /** The viewer's own crowd vote, 1 or 2. */
  myVote: number | null;
  /** Viewer is a party or a drawn juror on this case (they don't crowd-vote it). */
  viewerRole: "party" | "juror" | null;
  /** Comment count, or null where the viewer may not see it (this case's jurors before the verdict). */
  comments: number | null;
  /** Party wallets (public on-chain anyway), so the client can also recognise your own case instantly. */
  parties: string[];
};

export type FeedPage = { items: FeedItem[]; nextBefore: string | null };

/** Did the crowd voter agree with the official verdict? null until there is one. */
export function calledIt(myVote: number | null, status: number, verdict: number): boolean | null {
  if (!myVote || status !== 5) return null;
  return myVote === verdict;
}
