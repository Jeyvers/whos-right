import { dataKey } from "@/lib/network";
import { verifiedPerson } from "@/lib/server/person";
import { authenticate } from "@/lib/server/privy";
import { bad, parseCaseId } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Delete your own comment. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/cases/[id]/comments/[commentId]">) {
  const { id, commentId } = await ctx.params;
  const caseId = parseCaseId(id);
  if (!caseId || !UUID.test(commentId)) return bad("Bad comment.");
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const who = await verifiedPerson(user.wallets);
  if (!who) return bad("Only the person who wrote it can delete it.", 403);

  const { data, error } = await db()
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("network", dataKey)
    .eq("case_id", caseId.toString())
    .eq("person", who.person)
    .is("deleted_at", null)
    .select("id");
  if (error) return bad("Couldn't delete it. Try again.", 500);
  if (!data?.length) return bad("Only the person who wrote it can delete it.", 403);
  return Response.json({ ok: true });
}
