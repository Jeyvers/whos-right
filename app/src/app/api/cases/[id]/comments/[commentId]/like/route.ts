import { dataKey } from "@/lib/network";
import { commentContext } from "@/lib/server/comments";
import { bad, parseCaseId } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Like (POST) or unlike (DELETE) a comment. Only people who may comment on the case; not your own comment. */
async function handle(request: Request, ctx: RouteContext<"/api/cases/[id]/comments/[commentId]/like">, like: boolean) {
  const { id, commentId } = await ctx.params;
  const caseId = parseCaseId(id);
  if (!caseId || !UUID.test(commentId)) return bad("Bad comment.");
  const cc = await commentContext(request, caseId);
  if (!cc.user) return bad("Sign in to like comments.", 401);
  if (!cc.access.canWrite || !cc.person) return bad(cc.access.note ?? "Comments aren't open on this case.", 403);

  const { data: comment } = await db()
    .from("comments")
    .select("id, person")
    .eq("id", commentId)
    .eq("network", dataKey)
    .eq("case_id", caseId.toString())
    .eq("hidden", false)
    .is("deleted_at", null)
    .maybeSingle();
  if (!comment) return bad("That comment is gone.", 404);
  if (comment.person === cc.person) return bad("You can't like your own comment.", 403);

  if (like) {
    const { error } = await db()
      .from("comment_likes")
      .upsert({ comment_id: commentId, person: cc.person, privy_user_id: cc.user.userId }, { onConflict: "comment_id,person", ignoreDuplicates: true });
    if (error) return bad("Couldn't save your like. Try again.", 500);
  } else {
    const { error } = await db().from("comment_likes").delete().eq("comment_id", commentId).eq("person", cc.person);
    if (error) return bad("Couldn't remove your like. Try again.", 500);
  }
  return Response.json({ ok: true, liked: like });
}

export function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/comments/[commentId]/like">) {
  return handle(request, ctx, true);
}
export function DELETE(request: Request, ctx: RouteContext<"/api/cases/[id]/comments/[commentId]/like">) {
  return handle(request, ctx, false);
}
