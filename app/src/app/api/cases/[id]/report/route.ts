import { dataKey } from "@/lib/network";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad, parseCaseId } from "@/lib/server/http";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Report a case, or one comment on it ({ reason, commentId? }). */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/report">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const user = await authenticate(request);
  if (!user) return bad("Sign in to report.", 401);
  const { reason, commentId } = ((await request.json().catch(() => ({}))) ?? {}) as { reason?: string; commentId?: string };
  const comment = typeof commentId === "string" && UUID.test(commentId) ? commentId : null;
  const text = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (!text) return bad("Say briefly what's wrong.");
  const { error } = await db()
    .from("reports")
    .insert({ network: dataKey, case_id: caseId.toString(), reporter_user_id: user.userId, reason: text, ...(comment ? { comment_id: comment } : {}) });
  if (error) return bad("Couldn't send your report. Try again.", 500);
  return Response.json({ ok: true });
}
