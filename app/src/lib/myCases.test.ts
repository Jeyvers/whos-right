import { describe, expect, it } from "vitest";
import { myCredit, myRole, myStage } from "./myCases";

const ME = "0x00000000000000000000000000000000000000aa";
const THEM = "0x00000000000000000000000000000000000000bb";
const ZERO = "0x0000000000000000000000000000000000000000";
const base = { refundReason: 0, joinDeadline: 1000n, drawDeadline: 2000n };

describe("myStage", () => {
  it("open: waiting until the join deadline, then expired", () => {
    expect(myStage({ ...base, status: 1 }, 999)).toBe("waiting");
    expect(myStage({ ...base, status: 1 }, 1001)).toBe("expired");
  });
  it("joined and drawing read as drawing until the draw deadline", () => {
    expect(myStage({ ...base, status: 2 }, 1500)).toBe("drawing");
    expect(myStage({ ...base, status: 3 }, 1500)).toBe("drawing");
    expect(myStage({ ...base, status: 3 }, 2001)).toBe("expired");
  });
  it("voting and resolved", () => {
    expect(myStage({ ...base, status: 4 }, 0)).toBe("voting");
    expect(myStage({ ...base, status: 5 }, 0)).toBe("resolved");
  });
  it("splits refunds by reason", () => {
    expect(myStage({ ...base, status: 6, refundReason: 6 }, 0)).toBe("tie");
    expect(myStage({ ...base, status: 6, refundReason: 1 }, 0)).toBe("expired");
    expect(myStage({ ...base, status: 6, refundReason: 4 }, 0)).toBe("expired");
    expect(myStage({ ...base, status: 6, refundReason: 2 }, 0)).toBe("refunded");
    expect(myStage({ ...base, status: 6, refundReason: 5 }, 0)).toBe("refunded");
  });
});

describe("myRole", () => {
  it("finds the party, case-insensitively", () => {
    expect(myRole({ partyA: ME.toUpperCase().replace("0X", "0x") as `0x${string}`, partyB: THEM }, ME, false)).toBe("opened");
    expect(myRole({ partyA: THEM, partyB: ME }, ME, false)).toBe("joined");
  });
  it("juror only when on the jury, and never for strangers", () => {
    expect(myRole({ partyA: THEM, partyB: ZERO }, ME, true)).toBe("judged");
    expect(myRole({ partyA: THEM, partyB: ZERO }, ME, false)).toBeNull();
  });
});

describe("myCredit", () => {
  const c = { depositA: 100n, depositB: 90n, reveals: 0 };
  it("refund returns each party's own deposit", () => {
    expect(myCredit({ ...c, status: 6 }, "opened", false)).toBe(100n);
    expect(myCredit({ ...c, status: 6 }, "joined", false)).toBe(90n);
    expect(myCredit({ ...c, status: 6 }, "judged", true)).toBe(0n);
  });
  it("verdict pays revealing jurors an even share, nobody else", () => {
    const r = { ...c, status: 5, reveals: 4 };
    expect(myCredit(r, "judged", true)).toBe(47n); // 190 / 4, remainder ignored
    expect(myCredit(r, "judged", false)).toBe(0n);
    expect(myCredit(r, "opened", false)).toBe(0n);
  });
  it("nothing while a case is live", () => {
    expect(myCredit({ ...c, status: 4, reveals: 3 }, "judged", true)).toBe(0n);
  });
});
