import { recoverMessageAddress, type Hex } from "viem";
import { inviteViewMessage } from "@/lib/inviteView";
import { network } from "@/lib/network";
import { sameAddress, ZERO_ADDRESS } from "@/lib/cases";
import { readCase, readJurors } from "@/lib/server/chain";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad, parseCaseId } from "@/lib/server/http";

type Access = "party" | "juror" | "invite" | "public" | "none";

/**
 * Case text, with access rules:
 * - parties and drawn jurors: always
 * - the invite-link holder (proves it by signing with the invite key): A's side, while the case is open
 * - everyone: only if BOTH sides agreed to public display, it isn't hidden, and nobody asked for removal
 * Text is returned only if its hash matches the hash stored on-chain.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/cases/[id]">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const c = await readCase(caseId);
  if (c.status === 0) return bad("Case not found.", 404);

  const [{ data: sides }, { data: flags }] = await Promise.all([
    db()
      .from("sides")
      .select("body, salt, content_hash, public_consent, role")
      .eq("network", network.name)
      .eq("case_id", caseId.toString()),
    db()
      .from("case_flags")
      .select("hidden, removal_requested_at")
      .eq("network", network.name)
      .eq("case_id", caseId.toString())
      .maybeSingle(),
  ]);
  const sideA = sides?.find((s) => s.role === "A" && sameAddress(s.content_hash, c.contentA));
  const sideB = sides?.find((s) => s.role === "B" && sameAddress(s.content_hash, c.contentB));
  const hidden = Boolean(flags?.hidden);
  const removalRequested = Boolean(flags?.removal_requested_at);
  const isPublic = Boolean(sideA?.public_consent && sideB?.public_consent) && !hidden && !removalRequested;

  let access: Access = "none";
  const user = await authenticate(request);
  if (user) {
    const mine = (addr: string) => addr !== ZERO_ADDRESS && user.wallets.some((w) => sameAddress(w, addr));
    if (mine(c.partyA) || mine(c.partyB)) access = "party";
    else if ((await readJurors(caseId)).some((j) => mine(j))) access = "juror";
  }
  const inviteSig = request.headers.get("x-invite-signature") as Hex | null;
  if (access === "none" && inviteSig && c.status === 1) {
    const signer = await recoverMessageAddress({
      message: inviteViewMessage(network.name, caseId),
      signature: inviteSig,
    }).catch(() => null);
    if (signer && sameAddress(signer, c.inviteSigner)) access = "invite";
  }
  if (access === "none" && isPublic) access = "public";

  const canSeeA = access !== "none";
  const canSeeB = access === "party" || access === "juror" || access === "public";
  return Response.json({
    access,
    isPublic,
    hidden,
    removalRequested,
    sideA: canSeeA && sideA ? sideA.body : null,
    sideB: canSeeB && sideB ? sideB.body : null,
  });
}
