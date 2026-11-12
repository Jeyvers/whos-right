import { describe, expect, it } from "vitest";
import { commentAccess } from "./comments";

const anon = { signedIn: false, verified: false, juror: false };
const signedIn = { signedIn: true, verified: false, juror: false };
const verified = { signedIn: true, verified: true, juror: false };
const juror = { signedIn: true, verified: true, juror: true };

describe("comment access", () => {
  it("is closed on private or hidden cases", () => {
    for (const v of [anon, verified, juror]) expect(commentAccess(4, false, v)).toMatchObject({ canRead: false, canWrite: false, showCount: false });
  });
  it("is closed for everyone before the jury is drawn (anyone verified could still be drawn)", () => {
    for (const s of [2, 3]) for (const v of [anon, verified]) expect(commentAccess(s, true, v)).toMatchObject({ canRead: false, canWrite: false, showCount: false });
  });
  it("while the jury decides: verified non-jurors only; jurors see nothing, not even a count", () => {
    expect(commentAccess(4, true, verified)).toMatchObject({ canRead: true, canWrite: true });
    expect(commentAccess(4, true, anon)).toMatchObject({ canRead: false, canWrite: false, showCount: true });
    expect(commentAccess(4, true, signedIn)).toMatchObject({ canRead: false, canWrite: false });
    expect(commentAccess(4, true, juror)).toMatchObject({ canRead: false, canWrite: false, showCount: false });
  });
  it("after the verdict: everyone reads, verified people (jurors too) write", () => {
    for (const s of [5, 6]) {
      expect(commentAccess(s, true, anon)).toMatchObject({ canRead: true, canWrite: false });
      expect(commentAccess(s, true, juror)).toMatchObject({ canRead: true, canWrite: true });
      expect(commentAccess(s, true, verified)).toMatchObject({ canRead: true, canWrite: true });
    }
  });
});
