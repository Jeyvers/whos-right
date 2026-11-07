import { getAddress, isAddress } from "viem";
import { isGasStep } from "@/lib/gasSteps";
import { sameAddress } from "@/lib/cases";
import { authenticate } from "@/lib/server/privy";
import { requestTopup } from "@/lib/server/topup";
import { bad } from "@/lib/server/http";

export const maxDuration = 30;

/** Body: { address, steps: ["approve", "openCase", ...] }. Tops up only if the wallet can't cover those steps. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in first.", 401);
  const body = ((await request.json().catch(() => ({}))) ?? {}) as { address?: string; steps?: unknown[] };
  if (!body.address || !isAddress(body.address)) return bad("Bad address.");
  if (!user.wallets.some((w) => sameAddress(w, body.address))) return bad("That isn't your wallet.", 403);
  const steps = Array.isArray(body.steps) ? body.steps : [];
  if (steps.length === 0 || steps.length > 6 || !steps.every(isGasStep)) return bad("Bad steps.");
  return Response.json(await requestTopup({ userId: user.userId, address: getAddress(body.address), steps }));
}
