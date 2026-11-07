import { network } from "@/lib/network";
import { sameAddress } from "@/lib/cases";
import { readCase } from "@/lib/server/chain";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad, parseCaseId } from "@/lib/server/http";

/** After openCase/joinCase confirms, ties the saved side to the on-chain case. Verified against the chain. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/link">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const { sideId } = ((await request.json().catch(() => ({}))) ?? {}) as { sideId?: string };
  if (!sideId) return bad("Missing side.");

  const { data: side } = await db()
    .from("sides")
    .select("id, privy_user_id, content_hash, case_id")
    .eq("id", sideId)
    .eq("network", network.name)
    .maybeSingle();
  if (!side || side.privy_user_id !== user.userId) return bad("Side not found.", 404);

  const c = await readCase(caseId);
  const mine = (addr: string) => user.wallets.some((w) => sameAddress(w, addr));
  let role: "A" | "B" | null = null;
  if (sameAddress(c.contentA, side.content_hash) && mine(c.partyA)) role = "A";
  else if (sameAddress(c.contentB, side.content_hash) && mine(c.partyB)) role = "B";
  if (!role) return bad("That side doesn't match this case on-chain.", 409);

  if (side.case_id === null) {
    const { error } = await db().from("sides").update({ case_id: caseId.toString(), role }).eq("id", side.id);
    if (error) return bad("Couldn't link your side. Try again.", 500);
  }
  return Response.json({ ok: true, role });
}
