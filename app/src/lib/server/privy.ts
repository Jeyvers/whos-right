import "server-only";
import { PrivyClient } from "@privy-io/node";

let client: PrivyClient | undefined;

function privy(): PrivyClient {
  if (!client) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) throw new Error("Privy server credentials are not configured");
    client = new PrivyClient({ appId, appSecret });
  }
  return client;
}

export type AuthedUser = { userId: string; wallets: `0x${string}`[] };

/** Verifies the Privy access token from `Authorization: Bearer <token>`. Returns null if missing or invalid. */
export async function authenticate(request: Request): Promise<AuthedUser | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    const { user_id } = await privy().utils().auth().verifyAccessToken(token);
    const user = await privy().users()._get(user_id);
    const wallets = user.linked_accounts
      .filter((a) => a.type === "wallet" && "chain_type" in a && a.chain_type === "ethereum")
      .map((a) => (a as { address: string }).address.toLowerCase() as `0x${string}`);
    return { userId: user_id, wallets };
  } catch {
    return null;
  }
}
