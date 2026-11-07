import { AGREEMENT_VERSION } from "@/lib/agreement";
import { hasAgreed } from "@/lib/server/agreement";
import { authenticate } from "@/lib/server/privy";
import { db } from "@/lib/server/supabase";
import { bad } from "@/lib/server/http";

/** Whether the signed-in person has agreed to how cases work. */
export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  return Response.json({ agreed: await hasAgreed(user.userId) });
}

/** Records the agreement. Idempotent. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const { error } = await db()
    .from("agreements")
    .upsert({ privy_user_id: user.userId, version: AGREEMENT_VERSION, accepted_at: new Date().toISOString() });
  if (error) return bad("Couldn't save that. Try again.", 500);
  return Response.json({ agreed: true });
}
