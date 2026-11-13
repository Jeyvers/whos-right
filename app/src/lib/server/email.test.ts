import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "Rest My Case <alerts@example.com>", EMAIL_UNSUBSCRIBE_SECRET: "s3cret", APP_URL: "https://app.example" };

describe("email", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("signs unsubscribe links that only validate for the same user", async () => {
    const { unsubscribeUrl, validUnsubscribe } = await import("./email");
    const url = new URL(unsubscribeUrl("did:privy:abc"));
    expect(url.origin).toBe("https://app.example");
    const t = url.searchParams.get("t")!;
    expect(validUnsubscribe("did:privy:abc", t)).toBe(true);
    expect(validUnsubscribe("did:privy:other", t)).toBe(false);
    expect(validUnsubscribe("did:privy:abc", t.slice(1))).toBe(false);
  });

  it("is off when a setting is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("./email");
    expect(await sendEmail("a@b.co", "u", { subject: "s", heading: "h", body: "b", cta: "c", path: "/" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends through Resend with an unsubscribe header and escaped content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("./email");
    const ok = await sendEmail("a@b.co", "u1", { subject: "Hi", heading: "<b>x</b>", body: "b", cta: "Go", path: "/c/1" }, "key-1");
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["idempotency-key"]).toBe("key-1");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["a@b.co"]);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(body.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(body.html).toContain("https://app.example/c/1");
  });
});
