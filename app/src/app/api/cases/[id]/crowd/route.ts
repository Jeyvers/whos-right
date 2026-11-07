import { dataKey } from "@/lib/network";
import { sameAddress } from "@/lib/cases";
import { readCase, readJurors } from "@/lib/server/chain";
import { bad, parseCaseId } from "@/lib/server/http";
import { verifiedPerson } from "@/lib/server/person";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";

/**
 * Cast a crowd vote: { vote: 1 | 2 }. Not binding, not paid. One per verified person per case, final.
 * Refused for the two parties (any of their wallets) and for the case's drawn jurors, and once the verdict is in.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/crowd">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const user = await authenticate(request);
  if (!user) return bad("Sign in to vote.", 401);
  const { vote } = ((await request.json().catch(() => ({}))) ?? {}) as { vote?: number };
  if (vote !== 1 && vote !== 2) return bad("Pick a side.");

  const who = await verifiedPerson(user.wallets);
  if (!who) return bad("Verify you're a real person to vote.", 403);

  const c = await readCase(caseId);
  if (c.status < 2 || c.status > 4) return bad(c.status >= 5 ? "Voting on this case has closed." : "This case isn't open for votes yet.", 409);
  if (who.person === c.rootA.toLowerCase() || who.person === c.rootB.toLowerCase()) return bad("You can't vote on your own case.", 403);
  const jurors = await readJurors(caseId);
  if (user.wallets.some((w) => jurors.some((j) => sameAddress(j, w)))) {
    return bad("You're on this case's jury. Cast your official vote on the case page.", 409);
  }

  const { error } = await db().from("crowd_votes").insert({
    network: dataKey,
    case_id: caseId.toString(),
    person: who.person,
    privy_user_id: user.userId,
    wallet: who.wallet.toLowerCase(),
    vote,
  });
  if (error?.code === "23505") return bad("You've already voted on this case.", 409);
  if (error) return bad("Couldn't save your vote. Try again.", 500);
  return Response.json({ ok: true, vote });
}
