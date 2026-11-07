import { formatG } from "./format";

/** Where someone stands with today's GoodDollar claim. */
export type ClaimState =
  | { kind: "testnet"; amount: bigint } // the tG$ faucet stands in for the claim
  | { kind: "not_verified" }
  | { kind: "can_claim"; amount: bigint; nextClaimAt: Date }
  | { kind: "already_claimed"; nextClaimAt: Date }
  | { kind: "loading" };

/** UBIScheme days roll over at periodStart + n * 1 day. */
export function nextClaimTime(periodStart: bigint, currentDay: bigint): Date {
  return new Date(Number(periodStart + (currentDay + 1n) * 86_400n) * 1000);
}

export function claimState(input: { verified: boolean; entitlement: bigint; periodStart: bigint; currentDay: bigint }): ClaimState {
  if (!input.verified) return { kind: "not_verified" };
  const nextClaimAt = nextClaimTime(input.periodStart, input.currentDay);
  return input.entitlement > 0n ? { kind: "can_claim", amount: input.entitlement, nextClaimAt } : { kind: "already_claimed", nextClaimAt };
}

/** G$ available to pay right now: wallet balance plus today's unclaimed amount. */
export function claimable(state: ClaimState): bigint {
  return state.kind === "can_claim" || state.kind === "testnet" ? state.amount : 0n;
}

export function untilText(at: Date, now = new Date()): string {
  const mins = Math.max(1, Math.round((at.getTime() - now.getTime()) / 60_000));
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

/**
 * The message when balance + today's claim still isn't enough. Says exactly how much more is needed and what to do.
 */
export function shortMessage(opts: { fee: bigint; balance: bigint; state: ClaimState; sym: string; speedName?: string; now?: Date }): string {
  const { fee, balance, state, sym, speedName } = opts;
  const claim = claimable(state);
  const short = fee - balance - claim;
  const need = `You need ${formatG(fee)} ${sym}${speedName ? ` for ${speedName}` : ""}.`;
  const have =
    claim > 0n
      ? ` You have ${formatG(balance)} ${sym} plus ${formatG(claim)} ${sym} from today's claim, so you're ${formatG(short)} ${sym} short.`
      : ` You have ${formatG(balance)} ${sym}, so you're ${formatG(fee - balance)} ${sym} short.`;
  const next =
    state.kind === "can_claim" || state.kind === "already_claimed"
      ? ` Pick Standard, or come back after your next claim (${untilText(state.nextClaimAt, opts.now)}).`
      : " Pick Standard, or add G$ to your wallet.";
  return need + have + next;
}

/** Already claimed today, but not necessarily in this wallet. Explains where the G$ went. */
export function alreadyClaimedMessage(state: Extract<ClaimState, { kind: "already_claimed" }>, now?: Date): string {
  return (
    "Today's G$ has already been claimed for your verified identity, either here or in another wallet linked to you, " +
    "like GoodWallet. If it was claimed there, the G$ is in that wallet: send it to this wallet's address (on Account) " +
    `to use it here. Your next claim opens ${untilText(state.nextClaimAt, now)}.`
  );
}
