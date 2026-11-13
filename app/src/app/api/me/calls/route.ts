import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import type { ChainCase } from "@/lib/cases";
import { dataKey, network } from "@/lib/network";
import { publicClient } from "@/lib/server/chain";
import { verifiedPerson } from "@/lib/server/person";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";

/** Your "called it" record: crowd votes compared with official verdicts. */
export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const who = await verifiedPerson(user.wallets);
  if (!who || !network.restMyCase) return Response.json({ decided: 0, right: 0, pending: 0, streak: 0, votes: [] });

  const { data: votes } = await db()
    .from("crowd_votes")
    .select("case_id, vote, created_at")
    .eq("network", dataKey)
    .eq("person", who.person)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!votes?.length) return Response.json({ decided: 0, right: 0, pending: 0, streak: 0, votes: [] });

  const wr = network.restMyCase;
  const cases = (await publicClient.multicall({
    contracts: votes.map((v) => ({ address: wr, abi: restMyCaseAbi, functionName: "getCase", args: [BigInt(v.case_id)] }) as const),
    allowFailure: false,
  })) as ChainCase[];

  const rows = votes.map((v, i) => {
    const c = cases[i];
    const result = c.status === 5 ? (c.verdict === v.vote ? "right" : "wrong") : c.status === 6 ? "no_verdict" : "pending";
    return { caseId: String(v.case_id), vote: v.vote, result };
  });
  const decided = rows.filter((r) => r.result === "right" || r.result === "wrong");
  let streak = 0;
  for (const r of decided) {
    if (r.result !== "right") break;
    streak++;
  }
  return Response.json({
    decided: decided.length,
    right: decided.filter((r) => r.result === "right").length,
    pending: rows.filter((r) => r.result === "pending").length,
    streak,
    votes: rows,
  });
}
