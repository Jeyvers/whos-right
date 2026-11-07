import { describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_NETWORK", "celo-sepolia");
const { maySignSilently, MAX_CASE_FEE } = await import("./silentSigning");
const { network } = await import("./network");
const wr = network.whosRight!;
const gd = network.goodDollar;
const stranger = "0x000000000000000000000000000000000000dEaD";

describe("silent signing (testnet)", () => {
  it("allows WhosRight calls without CELO", () => {
    expect(maySignSilently({ address: wr, functionName: "openCase" })).toBe(true);
    expect(maySignSilently({ address: wr, functionName: "requestJury", value: 1n })).toBe(false);
  });
  it("allows only exact, capped approvals to WhosRight", () => {
    expect(maySignSilently({ address: gd, functionName: "approve", args: [wr, 100n * 10n ** 18n] })).toBe(true);
    expect(maySignSilently({ address: gd, functionName: "approve", args: [wr, MAX_CASE_FEE] })).toBe(true);
    expect(maySignSilently({ address: gd, functionName: "approve", args: [wr, MAX_CASE_FEE + 1n] })).toBe(false);
    expect(maySignSilently({ address: gd, functionName: "approve", args: [wr, 2n ** 256n - 1n] })).toBe(false);
    expect(maySignSilently({ address: gd, functionName: "approve", args: [stranger, 1n] })).toBe(false);
    expect(maySignSilently({ address: gd, functionName: "approve", args: [wr, 0n] })).toBe(false);
  });
  it("never allows token transfers or unknown contracts", () => {
    expect(maySignSilently({ address: gd, functionName: "transfer", args: [stranger, 1n] })).toBe(false);
    expect(maySignSilently({ address: gd, functionName: "transferFrom", args: [stranger, stranger, 1n] })).toBe(false);
    expect(maySignSilently({ address: stranger, functionName: "openCase" })).toBe(false);
  });
});

describe("silent signing (mainnet)", () => {
  it("is always off", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_NETWORK", "celo");
    const m = await import("./silentSigning");
    const n = await import("./network");
    expect(n.network.testnet).toBeUndefined();
    expect(m.maySignSilently({ address: n.network.goodDollar, functionName: "approve", args: [stranger, 1n] })).toBe(false);
  });
});
