import { bytesToHex } from "viem";
import { contentHash } from "@/lib/content";
import { dataKey } from "@/lib/network";
import { hasAgreed } from "@/lib/server/agreement";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad } from "@/lib/server/http";
import { checkSideText, checkTitle } from "@/lib/textRules";

/**
 * Saves a side (before it goes on-chain) and returns the hash to put on-chain.
 * Body: { text, title?, strict? }. A's side carries the case title. `strict` = one-sided case: the stricter privacy
 * rules apply (the other person can't reply). The link step refuses to publish a one-sided case saved without them.
 */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const body = (await request.json().catch(() => null)) as { text?: unknown; title?: unknown; strict?: unknown } | null;
  if (!body || typeof body.text !== "string") return bad("Missing text.");
  if (body.title !== undefined && body.title !== null && typeof body.title !== "string") return bad("Bad title.");
  const strict = body.strict === true;
  // Agreed once, after sign-up (AgreementGate). Checked here so no client can skip it.
  if (!(await hasAgreed(user.userId))) return bad("Agree to how cases work first.", 403);

  const text = body.text.trim();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const errors = [
    ...(typeof body.title === "string" ? checkTitle(title, { strict }).errors : []),
    ...checkSideText(text, { strict }).errors,
  ];
  if (errors.length) return bad(errors.join(" "));

  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = contentHash(salt, title, text);
  const { data, error } = await db()
    .from("sides")
    .insert({
      network: dataKey,
      privy_user_id: user.userId,
      body: text,
      title: title || null,
      strict,
      salt,
      content_hash: hash,
      public_consent: true, // from the sign-up agreement
    })
    .select("id")
    .single();
  if (error) return bad("Couldn't save your side. Try again.", 500);
  return Response.json({ sideId: data.id, contentHash: hash });
}
