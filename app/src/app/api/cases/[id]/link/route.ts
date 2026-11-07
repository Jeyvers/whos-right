import { after } from "next/server";
import { dataKey } from "@/lib/network";
import { runKeeper } from "@/lib/server/keeper";
import { sameAddress } from "@/lib/cases";
import { readCase } from "@/lib/server/chain";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad, parseCaseId } from "@/lib/server/http";

// Up to ~15s of retries while lagging RPC nodes catch up (see below).
export const maxDuration = 30;

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
    .select("id, privy_user_id, content_hash, case_id, strict")
    .eq("id", sideId)
    .eq("network", dataKey)
    .maybeSingle();
  if (!side || side.privy_user_id !== user.userId) return bad("Side not found.", 404);

  const mine = (addr: string) => user.wallets.some((w) => sameAddress(w, addr));
  const roleIn = (c: Awaited<ReturnType<typeof readCase>>): "A" | "B" | null =>
    sameAddress(c.contentA, side.content_hash) && mine(c.partyA)
      ? "A"
      : sameAddress(c.contentB, side.content_hash) && mine(c.partyB)
        ? "B"
        : null;

  // The browser calls this as soon as ITS node confirms the transaction. Ours is a fallback over several public
  // RPCs that can trail by a few blocks (5 seen on Celo Sepolia), and a behind node returns an empty case or one
  // not yet joined. So a miss is retried for a while before it counts as a real mismatch.
  let role: "A" | "B" | null = null;
  for (let attempt = 0; attempt < 10 && !role; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
    role = roleIn(await readCase(caseId));
  }
  if (!role) return bad("That side doesn't match this case on-chain.", 409);
  // One-sided: the other person can't reply, so only text that passed the strict privacy rules is published.
  const chainCase = await readCase(caseId);
  if (chainCase.mode === 1 && !side.strict) return bad("One-sided cases need the stricter privacy check. Rewrite and try again.", 409);

  if (side.case_id === null) {
    const { error } = await db().from("sides").update({ case_id: caseId.toString(), role }).eq("id", side.id);
    if (error) return bad("Couldn't link your side. Try again.", 500);
  }
  // B just joined: call the jury right away instead of waiting for the next scheduled run.
  // Ready for a jury (B joined, or a one-sided case): call it now instead of waiting for the next scheduled run.
  if (role === "B" || chainCase.mode === 1) after(() => runKeeper(role === "B" ? "joined" : "opened").catch(() => {}));
  return Response.json({ ok: true, role });
}
