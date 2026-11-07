import { after } from "next/server";
import { runKeeper } from "@/lib/server/keeper";
import { authenticate } from "@/lib/server/privy";

export const maxDuration = 60;

/** A signed-in user's action nudges the keeper right away instead of waiting for the next minute. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  after(() => runKeeper("user").catch(() => {}));
  return Response.json({ ok: true }, { status: 202 });
}
