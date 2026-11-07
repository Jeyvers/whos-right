import { describe, expect, it } from "vitest";
import type { ChainCase } from "./cases";
import { decide } from "./keeperRules";

const base = {
  status: 1,
  joinDeadline: 100n,
  drawDeadline: 200n,
  commitDeadline: 300n,
  revealDeadline: 400n,
  commits: 0,
  reveals: 0,
} as unknown as ChainCase;
const at = (patch: Partial<ChainCase>) => ({ ...base, ...patch }) as ChainCase;

describe("keeper decide", () => {
  it("open: waits, then refunds after the join deadline", () => {
    expect(decide(at({ status: 1 }), 0, false, 100n)).toBeNull();
    expect(decide(at({ status: 1 }), 0, false, 101n)).toBe("cancelExpired");
  });
  it("joined: requests a jury, or refunds after the draw deadline", () => {
    expect(decide(at({ status: 2 }), 0, false, 150n)).toBe("requestJury");
    expect(decide(at({ status: 2 }), 0, false, 201n)).toBe("cancelExpired");
  });
  it("drawing: waits for randomness, draws, or refunds after the deadline", () => {
    expect(decide(at({ status: 3 }), 0, false, 150n)).toBeNull();
    expect(decide(at({ status: 3 }), 0, true, 150n)).toBe("drawJury");
    expect(decide(at({ status: 3 }), 0, true, 201n)).toBe("cancelExpired");
  });
  it("voting: finalizes after the reveal deadline", () => {
    expect(decide(at({ status: 4, commits: 3, reveals: 1 }), 5, false, 350n)).toBeNull();
    expect(decide(at({ status: 4, commits: 3, reveals: 1 }), 5, false, 401n)).toBe("finalize");
  });
  it("voting: finalizes early once every committed juror revealed and reveal is open", () => {
    expect(decide(at({ status: 4, commits: 5, reveals: 5 }), 5, false, 250n)).toBe("finalize");
    expect(decide(at({ status: 4, commits: 3, reveals: 3 }), 5, false, 301n)).toBe("finalize");
    expect(decide(at({ status: 4, commits: 3, reveals: 3 }), 5, false, 250n)).toBeNull(); // commit stage still open
  });
  it("voting with no commits: refunds as soon as the commit stage ends (nobody can reveal)", () => {
    expect(decide(at({ status: 4, commits: 0, reveals: 0 }), 5, false, 250n)).toBeNull();
    expect(decide(at({ status: 4, commits: 0, reveals: 0 }), 5, false, 301n)).toBe("finalize");
  });
  it("finished cases need nothing", () => {
    expect(decide(at({ status: 5 }), 5, false, 999n)).toBeNull();
    expect(decide(at({ status: 6 }), 5, false, 999n)).toBeNull();
  });
});
