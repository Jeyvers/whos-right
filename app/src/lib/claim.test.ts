import { describe, expect, it } from "vitest";
import { alreadyClaimedMessage, claimState, claimable, nextClaimTime, shortMessage } from "./claim";

const G = 10n ** 18n;
const periodStart = 1677672000n; // live UBIScheme value on Celo
const day = 1347n;

describe("daily claim", () => {
  it("computes the next claim time from the UBIScheme day", () => {
    expect(nextClaimTime(periodStart, day).toISOString()).toBe(new Date((1677672000 + 1348 * 86400) * 1000).toISOString());
  });
  it("classifies verified / unverified / already claimed", () => {
    expect(claimState({ verified: false, entitlement: 5n, periodStart, currentDay: day }).kind).toBe("not_verified");
    expect(claimState({ verified: true, entitlement: 124n * G, periodStart, currentDay: day }).kind).toBe("can_claim");
    expect(claimState({ verified: true, entitlement: 0n, periodStart, currentDay: day }).kind).toBe("already_claimed");
  });
  it("one claim covers Standard but says exactly how much more Fast needs", () => {
    const s = claimState({ verified: true, entitlement: 124n * G, periodStart, currentDay: day });
    expect(claimable(s)).toBe(124n * G);
    const now = new Date((1677672000 + 1347 * 86400 + 3600 * 17) * 1000); // 7h before the next claim
    const msg = shortMessage({ fee: 300n * G, balance: 40n * G, state: s, sym: "G$", speedName: "Fast", now });
    expect(msg).toBe(
      "You need 300 G$ for Fast. You have 40 G$ plus 124 G$ from today's claim, so you're 136 G$ short. Pick Standard, or come back after your next claim (in 7h).",
    );
  });
  it("explains a claim made in another wallet", () => {
    const s = claimState({ verified: true, entitlement: 0n, periodStart, currentDay: day });
    if (s.kind !== "already_claimed") throw new Error("expected already_claimed");
    expect(alreadyClaimedMessage(s)).toMatch(/GoodWallet/);
  });
});
