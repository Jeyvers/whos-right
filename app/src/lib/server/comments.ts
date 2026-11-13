import "server-only";
import { keccak256, toHex, type Address } from "viem";
import { restMyCaseAbi } from "@/lib/abi/restMyCase";
import { sameAddress, ZERO_ADDRESS, type ChainCase } from "@/lib/cases";
import { commentAccess, type CommentAccess, type CommentBadge } from "@/lib/comments";
import { dataKey, network } from "@/lib/network";
import { publicClient, readCase, readJurors } from "./chain";
import { verifiedPerson } from "./person";
import { authenticate } from "./privy";
import { db } from "./supabase";

export type CommentContext = {
  c: ChainCase;
  access: CommentAccess;
  user: { userId: string; wallets: string[] } | null;
  person: string | null;
  /** Lowercased identity roots of this case's drawn jurors. */
  jurorRoots: string[];
  /** Lowercased identity roots of the parties ("" if none). */
  rootA: string;
  rootB: string;
};

/** Same public test as the case page: both sides agreed (A alone for one-sided) and an admin hasn't hidden it. */
async function isPublicCase(caseId: bigint, c: ChainCase): Promise<boolean> {
  const [{ data: sides }, { data: flags }] = await Promise.all([
    db().from("sides").select("role, content_hash, public_consent").eq("network", dataKey).eq("case_id", caseId.toString()),
    db().from("case_flags").select("hidden").eq("network", dataKey).eq("case_id", caseId.toString()).maybeSingle(),
  ]);
  const a = sides?.find((s) => s.role === "A" && sameAddress(s.content_hash, c.contentA));
  const b = sides?.find((s) => s.role === "B" && sameAddress(s.content_hash, c.contentB));
  return Boolean(a?.public_consent && (c.mode === 1 || b?.public_consent)) && !flags?.hidden;
}

/** Who is asking, what they may do, and the facts needed to label authors. */
export async function commentContext(request: Request, caseId: bigint): Promise<CommentContext> {
  const c = await readCase(caseId);
  const user = await authenticate(request);
  const [isPublic, jurors, who] = await Promise.all([
    c.status >= 2 ? isPublicCase(caseId, c) : Promise.resolve(false),
    c.status >= 4 ? readJurors(caseId) : Promise.resolve([] as readonly Address[]),
    user ? verifiedPerson(user.wallets) : Promise.resolve(null),
  ]);
  const wr = network.restMyCase!;
  const jurorVotes = jurors.length
    ? ((await publicClient.multicall({
        contracts: jurors.map((j) => ({ address: wr, abi: restMyCaseAbi, functionName: "getJurorVote", args: [caseId, j] }) as const),
        allowFailure: false,
      })) as { root: Address }[])
    : [];
  const jurorRoots = jurorVotes.map((v) => v.root.toLowerCase()).filter((r) => r !== ZERO_ADDRESS);
  const person = who?.person ?? null;
  // A juror by wallet OR by verified person (another wallet of the same human).
  const juror = Boolean(
    user?.wallets.some((w) => jurors.some((j) => sameAddress(j, w))) || (person && jurorRoots.includes(person)),
  );
  const access = commentAccess(c.status, isPublic, { signedIn: Boolean(user), verified: Boolean(person), juror });
  const root = (r: string) => (r === ZERO_ADDRESS ? "" : r.toLowerCase());
  return { c, access, user, person, jurorRoots, rootA: root(c.rootA), rootB: root(c.rootB) };
}

/** "Person 3f9a": stable within one case, different on every case, so comments can't be linked across cases. */
export function pseudonym(caseId: bigint, person: string): string {
  return `Person ${keccak256(toHex(`${dataKey}:${caseId}:${person}`)).slice(2, 6)}`;
}

export function badgeFor(ctx: CommentContext, person: string): CommentBadge {
  if (person === ctx.rootA) return ctx.c.mode === 1 ? "author" : "first-side";
  if (person === ctx.rootB) return "their-side";
  if (ctx.jurorRoots.includes(person)) return "juror";
  return null;
}
