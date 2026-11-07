import { authenticate } from "@/lib/server/privy";

/** Returns the signed-in user's Privy id and linked Ethereum wallets. Proves server-side auth works. */
export async function GET(request: Request) {
  const user = await authenticate(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(user);
}
