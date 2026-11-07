import { dataKey } from "@/lib/network";
import { sameAddress } from "@/lib/cases";
import { readCase } from "@/lib/server/chain";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad, parseCaseId } from "@/lib/server/http";

/** Either party takes the case off public view. Immediate; an admin can review later. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/removal">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const c = await readCase(caseId);
  const isParty = user.wallets.some((w) => sameAddress(w, c.partyA) || sameAddress(w, c.partyB));
  if (!isParty) return bad("Only the two people in this case can ask for removal.", 403);

  const { error } = await db()
    .from("case_flags")
    .upsert(
      {
        network: dataKey,
        case_id: caseId.toString(),
        removal_requested_at: new Date().toISOString(),
        removal_requested_by: user.userId,
      },
      { onConflict: "network,case_id" },
    );
  if (error) return bad("Couldn't save your request. Try again.", 500);
  return Response.json({ ok: true });
}
