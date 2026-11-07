import { timingSafeEqual } from "node:crypto";
import { runKeeper } from "@/lib/server/keeper";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.KEEPER_CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/** Called every minute by the Supabase scheduled job, with the cron secret. */
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runKeeper("cron");
  const body = JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  return new Response(body, { headers: { "content-type": "application/json" } });
}
