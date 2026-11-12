import { COMMENT_COOLDOWN_SECONDS, MAX_COMMENTS_PER_CASE, type CommentsResponse } from "@/lib/comments";
import { dataKey } from "@/lib/network";
import { checkComment } from "@/lib/textRules";
import { badgeFor, commentContext, pseudonym } from "@/lib/server/comments";
import { bad, parseCaseId } from "@/lib/server/http";
import { db } from "@/lib/server/supabase";

/** Comments on a case, oldest first. Jurors get nothing (not even a count) until the verdict. */
export async function GET(request: Request, ctx: RouteContext<"/api/cases/[id]/comments">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const cc = await commentContext(request, caseId);
  if (cc.c.status === 0) return bad("Case not found.", 404);

  const empty: CommentsResponse = { access: cc.access, count: null, comments: [] };
  if (!cc.access.showCount) {
    return Response.json(empty, { headers: { "cache-control": "no-store" } });
  }
  const { data, error } = await db()
    .from("comments")
    .select("id, person, body, created_at")
    .eq("network", dataKey)
    .eq("case_id", caseId.toString())
    .eq("hidden", false)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return bad("Couldn't load comments.", 500);
  const rows = data ?? [];
  const { data: likeRows } =
    cc.access.canRead && rows.length
      ? await db().from("comment_likes").select("comment_id, person").in("comment_id", rows.map((r) => r.id))
      : { data: [] as { comment_id: string; person: string }[] };
  const body: CommentsResponse = {
    access: cc.access,
    count: rows.length,
    comments: cc.access.canRead
      ? rows.map((r) => ({
          id: r.id,
          body: r.body,
          author: pseudonym(caseId, r.person),
          badge: badgeFor(cc, r.person),
          mine: r.person === cc.person,
          likes: likeRows?.filter((l) => l.comment_id === r.id).length ?? 0,
          likedByMe: Boolean(cc.person && likeRows?.some((l) => l.comment_id === r.id && l.person === cc.person)),
          createdAt: r.created_at,
        }))
      : [],
  };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

/** Post a comment: { body }. */
export async function POST(request: Request, ctx: RouteContext<"/api/cases/[id]/comments">) {
  const caseId = parseCaseId((await ctx.params).id);
  if (!caseId) return bad("Bad case id.");
  const cc = await commentContext(request, caseId);
  if (!cc.user) return bad("Sign in to comment.", 401);
  if (!cc.access.canWrite || !cc.person) return bad(cc.access.note ?? "Comments aren't open on this case.", 403);

  const { body } = ((await request.json().catch(() => ({}))) ?? {}) as { body?: unknown };
  const text = typeof body === "string" ? body.trim() : "";
  const check = checkComment(text);
  if (check.errors.length) return bad(check.errors[0]);

  const since = new Date(Date.now() - COMMENT_COOLDOWN_SECONDS * 1000).toISOString();
  const [{ count: recent }, { count: onCase }] = await Promise.all([
    db().from("comments").select("id", { count: "exact", head: true }).eq("network", dataKey).eq("person", cc.person).gte("created_at", since),
    db()
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("network", dataKey)
      .eq("case_id", caseId.toString())
      .eq("person", cc.person),
  ]);
  if ((recent ?? 0) > 0) return bad("Slow down a little. Try again in a few seconds.", 429);
  if ((onCase ?? 0) >= MAX_COMMENTS_PER_CASE) return bad("You've said a lot on this case already.", 429);

  const { data, error } = await db()
    .from("comments")
    .insert({ network: dataKey, case_id: caseId.toString(), person: cc.person, privy_user_id: cc.user.userId, body: text })
    .select("id, created_at")
    .single();
  if (error || !data) return bad("Couldn't post your comment. Try again.", 500);
  return Response.json({
    ok: true,
    comment: {
      id: data.id,
      body: text,
      author: pseudonym(caseId, cc.person),
      badge: badgeFor(cc, cc.person),
      mine: true,
      likes: 0,
      likedByMe: false,
      createdAt: data.created_at,
    },
  });
}
