import { describe, expect, it } from "vitest";
import { checkComment, checkSideText, checkTitle } from "./textRules";

const ok = "My roommate says chips are the best breakfast side, I say sausage.";

describe("privacy rules", () => {
  it("passes a clean side in both modes", () => {
    expect(checkSideText(ok).errors).toEqual([]);
    expect(checkSideText(ok, { strict: true }).errors).toEqual([]);
  });
  it("always blocks contact details", () => {
    expect(checkSideText(`${ok} Call +234 803 123 4567`).errors.length).toBeGreaterThan(0);
    expect(checkSideText(`${ok} mail joe@example.com`).errors.length).toBeGreaterThan(0);
  });
  it("warns on names normally, blocks them in strict (one-sided) mode", () => {
    const named = "My roommate John Smith never does the dishes, ever, at all.";
    expect(checkSideText(named).errors).toEqual([]);
    expect(checkSideText(named).warnings.length).toBe(1);
    expect(checkSideText(named, { strict: true }).errors.length).toBe(1);
    expect(checkSideText("My boss is called Kemi and she never listens to me.", { strict: true }).errors.length).toBe(1);
    expect(checkSideText("My boss @kemi_k never listens to anybody in meetings.", { strict: true }).errors.length).toBe(1);
  });
  it("checks titles", () => {
    expect(checkTitle("Chips or sausage?").errors).toEqual([]);
    expect(checkTitle("Hi").errors).toEqual(["Give your case a title (at least 5 characters)."]);
    expect(checkTitle("See www.example.com now").errors).toEqual(["Remove the link from the title."]);
    expect(checkTitle("Is Tunde Bakare wrong?", { strict: true }).errors.length).toBe(1);
  });
});

describe("comment rules", () => {
  it("allows a plain comment, blocks empty, links and contact details", () => {
    expect(checkComment("First side is clearly right, sausage wins.").errors).toEqual([]);
    expect(checkComment("   ").errors).toEqual(["Write something first."]);
    expect(checkComment("see www.example.com").errors).toEqual(["Remove the link."]);
    expect(checkComment("text me +234 803 123 4567").errors.length).toBe(1);
    expect(checkComment("x".repeat(501)).errors.length).toBe(1);
  });
});
