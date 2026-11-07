import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const FRIENDLY: Record<string, string> = {
  NotVerified: "Verify you're a real person first.",
  NewCasesArePaused: "New cases are paused right now.",
  TermsMismatch: "The case terms changed. Reload and check them again.",
  DeadlinePassed: "Too late: the deadline for this step has passed.",
  DeadlineNotReached: "Not yet: the deadline hasn't passed.",
  SameIdentity: "You can't join your own case.",
  InvalidInvite: "This invite link isn't valid for this case.",
  WrongStatus: "The case has moved on. Reload to see where it is now.",
  AlreadyInPool: "You're already in the jury pool.",
  NotInPool: "You're not in the jury pool.",
  NotJuror: "You're not on this jury.",
  AlreadyCommitted: "You've already voted.",
  AlreadyRevealed: "You've already revealed your vote.",
  RevealNotOpen: "Reveal hasn't opened yet.",
  InvalidReveal: "That doesn't match the vote you locked in.",
  IdentityChanged: "Your verification changed since you were drawn.",
  NothingToWithdraw: "Nothing to withdraw yet.",
  RandomnessNotReady: "The jury draw isn't ready yet. Try again in a minute.",
  ERC20InsufficientBalance: "Not enough G$ in your wallet.",
  ERC20InsufficientAllowance: "The payment approval didn't go through. Try again.",
};

/** Turns a wallet/contract error into one plain sentence. */
export function friendlyError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return "You cancelled in your wallet.";
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && FRIENDLY[name]) return FRIENDLY[name];
      if (name) return `The contract refused: ${name}.`;
    }
    if (/insufficient funds/i.test(e.message)) return "Not enough CELO for the network fee (gas).";
    // Some RPCs don't pass the revert reason back; don't show the raw transaction dump.
    if (/execution reverted/i.test(e.message)) return "That didn't go through. The case may have just moved on; refresh to see where it is.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}
