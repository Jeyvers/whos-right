import { bytesToHex } from "viem";
import { contentHash } from "@/lib/content";
import { network } from "@/lib/network";
import { hasAgreed } from "@/lib/server/agreement";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad } from "@/lib/server/http";
import { checkSideText } from "@/lib/textRules";

/** Saves a side's text (before it goes on-chain) and returns the hash to put on-chain. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") return bad("Missing text.");
  // Agreed once, after sign-up (AgreementGate). Checked here so no client can skip it.
  if (!(await hasAgreed(user.userId))) return bad("Agree to how cases work first.", 403);

  const text = body.text.trim();
  const { errors } = checkSideText(text);
  if (errors.length) return bad(errors.join(" "));

  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = contentHash(salt, text);
  const { data, error } = await db()
    .from("sides")
    .insert({
      network: network.name,
      privy_user_id: user.userId,
      body: text,
      salt,
      content_hash: hash,
      public_consent: true, // from the sign-up agreement
    })
    .select("id")
    .single();
  if (error) return bad("Couldn't save your side. Try again.", 500);
  return Response.json({ sideId: data.id, contentHash: hash });
}
