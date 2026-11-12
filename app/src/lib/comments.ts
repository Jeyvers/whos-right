/**
 * Case comments: who can read and write them. Shared by the server (enforced) and tests.
 *
 * The jury must never be swayed, so:
 * - Before the jury is drawn (status 2 Joined, 3 Drawing) comments are closed: anyone verified could still end up
 *   on this jury, so nobody may read the crowd's arguments yet.
 * - While the jury decides (status 4 Voting): only signed-in, verified people who are NOT on this case's jury.
 *   Verification is one identity per real person, so a juror can't sign out or switch accounts to read them.
 * - Once the verdict is in (5 Resolved, 6 Refunded): everyone reads; anyone verified writes.
 * Only public, non-hidden cases have comments.
 */

export const MAX_COMMENT_LENGTH = 500;
/** Per person, per case. */
export const MAX_COMMENTS_PER_CASE = 30;
/** Seconds between two comments from the same person (any case). */
export const COMMENT_COOLDOWN_SECONDS = 15;

export type CommentViewer = {
  signedIn: boolean;
  verified: boolean;
  /** On this case's drawn jury (any of their wallets, or the same verified person). */
  juror: boolean;
};

export type CommentAccess = {
  canRead: boolean;
  canWrite: boolean;
  /** How many comments there are may be shown (never to this case's jurors before the verdict). */
  showCount: boolean;
  note: string | null;
};

export function commentAccess(status: number, isPublic: boolean, v: CommentViewer): CommentAccess {
  if (!isPublic || status < 2) return { canRead: false, canWrite: false, showCount: false, note: null };
  const decided = status === 5 || status === 6;
  if (decided) {
    return {
      canRead: true,
      canWrite: v.verified,
      showCount: true,
      note: v.verified ? null : v.signedIn ? "Verify you're a real person to comment." : "Sign in to comment.",
    };
  }
  if (status === 2 || status === 3) {
    return { canRead: false, canWrite: false, showCount: false, note: "Comments open once the jury is drawn." };
  }
  // status 4: the jury is deciding.
  if (v.juror) {
    return { canRead: false, canWrite: false, showCount: false, note: "You're on this jury, so comments stay hidden from you until the verdict. Decide on the case alone." };
  }
  if (!v.verified) {
    return {
      canRead: false,
      canWrite: false,
      showCount: true,
      note: v.signedIn
        ? "While the jury decides, only verified people can read comments. Verify you're a real person to join in."
        : "While the jury decides, only verified people can read comments. Sign in to join in.",
    };
  }
  return { canRead: true, canWrite: true, showCount: true, note: "The jury can't see these until the verdict." };
}

export type CommentBadge = "first-side" | "their-side" | "author" | "juror" | null;

export type CaseComment = {
  id: string;
  body: string;
  /** Per-case pseudonym, e.g. "Person 3f9a": stable within a case, not linkable across cases. */
  author: string;
  badge: CommentBadge;
  mine: boolean;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
};

export type CommentsResponse = {
  access: CommentAccess;
  /** null when the viewer may not even see how many there are (jurors while deciding). */
  count: number | null;
  comments: CaseComment[];
};
