import { isHex } from "viem";
import { network } from "@/lib/network";
import { sameAddress } from "@/lib/cases";
import { readJurors } from "@/lib/server/chain";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad, parseCaseId } from "@/lib/server/http";

/**
 * Fallback vote keys for wallets whose signatures aren't repeatable. The juror is told that the operator can
 * see this key (and so could work out their vote before reveal).
 */
async function jurorWallet(request: Request, caseIdRaw: string | null, jurorRaw: string | null) {
  const caseId = caseIdRaw ? parseCaseId(caseIdRaw) : null;
  if (!caseId || !jurorRaw) return { error: bad("Missing case or juror.") };
  const user = await authenticate(request);
  if (!user) return { error: bad("Sign in first.", 401) };
  if (!user.wallets.some((w) => sameAddress(w, jurorRaw))) return { error: bad("Not your wallet.", 403) };
  if (!(await readJurors(caseId)).some((j) => sameAddress(j, jurorRaw))) return { error: bad("Not a juror.", 403) };
  return { caseId, juror: jurorRaw.toLowerCase() };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const r = await jurorWallet(request, url.searchParams.get("caseId"), url.searchParams.get("juror"));
  if ("error" in r) return r.error;
  const { data } = await db()
    .from("vote_salts")
    .select("salt")
    .eq("network", network.name)
    .eq("case_id", r.caseId.toString())
    .eq("juror", r.juror)
    .maybeSingle();
  return Response.json({ salt: data?.salt ?? null });
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { caseId?: string; juror?: string; salt?: string };
  const r = await jurorWallet(request, body.caseId ?? null, body.juror ?? null);
  if ("error" in r) return r.error;
  if (!body.salt || !isHex(body.salt) || body.salt.length !== 66) return bad("Bad salt.");
  const { error } = await db()
    .from("vote_salts")
    .insert({ network: network.name, case_id: r.caseId.toString(), juror: r.juror, salt: body.salt });
  if (error && error.code !== "23505") return bad("Couldn't save your vote key.", 500);
  return Response.json({ ok: true });
}
