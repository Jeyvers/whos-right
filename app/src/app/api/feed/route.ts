import { feedPage } from "@/lib/server/feed";
import { parseCaseId } from "@/lib/server/http";
import { verifiedPerson } from "@/lib/server/person";
import { authenticate } from "@/lib/server/privy";

export const maxDuration = 30;

/** Public feed of cases. Works signed out; signed in, it also marks your own vote and role on each case. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? parseCaseId(beforeRaw) ?? undefined : undefined;
  const user = await authenticate(request);
  const viewer = user ? { wallets: user.wallets, person: (await verifiedPerson(user.wallets))?.person ?? null } : null;
  return Response.json(await feedPage({ before, limit: 8, viewer }), { headers: { "cache-control": "no-store" } });
}
