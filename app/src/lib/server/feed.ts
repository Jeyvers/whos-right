import "server-only";
import type { Address } from "viem";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { sameAddress, ZERO_ADDRESS, type ChainCase } from "@/lib/cases";
import { commentAccess } from "@/lib/comments";
import type { FeedItem, FeedPage } from "@/lib/crowd";
import { dataKey, network } from "@/lib/network";
import { publicClient } from "./chain";
import { db } from "./supabase";

const BATCH = 25;
const MAX_SCAN = 150;

type Viewer = { wallets: string[]; person: string | null } | null;

/**
 * Public cases, newest first: both sides in (status >= Joined), both sides agreed to be public, not hidden, and
 * no removal requested. Crowd tallies stay hidden until the official verdict. Scans the chain directly; an
 * indexer replaces this at volume.
 */
export async function feedPage(opts: { before?: bigint; limit?: number; viewer: Viewer }): Promise<FeedPage> {
  const wr = network.whosRight;
  if (!wr) return { items: [], nextBefore: null };
  const limit = Math.min(opts.limit ?? 10, 20);
  const count = await publicClient.readContract({ address: wr, abi: whosRightAbi, functionName: "caseCount" });
  let cursor = opts.before !== undefined ? opts.before - 1n : count;
  const items: FeedItem[] = [];
  let scanned = 0;

  while (cursor >= 1n && items.length < limit && scanned < MAX_SCAN) {
    const ids: bigint[] = [];
    for (let id = cursor; id >= 1n && ids.length < BATCH; id--) ids.push(id);
    cursor = ids[ids.length - 1] - 1n;
    scanned += ids.length;

    const reads = await publicClient.multicall({
      contracts: ids.flatMap((id) => [
        { address: wr, abi: whosRightAbi, functionName: "getCase", args: [id] } as const,
        { address: wr, abi: whosRightAbi, functionName: "getJurors", args: [id] } as const,
      ]),
      allowFailure: false,
    });
    const chain = ids.map((id, i) => ({ id, c: reads[i * 2] as ChainCase, jurors: reads[i * 2 + 1] as readonly Address[] }));
    // Ready for judging: two-sided once B has joined; one-sided as soon as it's opened (no B, status starts at Joined).
    const joined = chain.filter(({ c }) => c.status >= 2 && (c.mode === 1 || c.partyB !== ZERO_ADDRESS));
    if (joined.length === 0) continue;
    const idStrs = joined.map(({ id }) => id.toString());

    // Jurors are matched by verified person too (any wallet of the same human), so fetch roots for live juries.
    const v0 = opts.viewer;
    const liveJuries = v0?.person ? joined.filter(({ c, jurors }) => c.status === 4 && jurors.length > 0) : [];
    const rootReads = liveJuries.length
      ? ((await publicClient.multicall({
          contracts: liveJuries.flatMap(({ id, jurors }) =>
            jurors.map((j) => ({ address: wr, abi: whosRightAbi, functionName: "getJurorVote", args: [id, j] }) as const),
          ),
          allowFailure: false,
        })) as { root: Address }[])
      : [];
    const jurorRootsByCase = new Map<string, string[]>();
    let k = 0;
    for (const { id, jurors } of liveJuries) {
      jurorRootsByCase.set(id.toString(), rootReads.slice(k, k + jurors.length).map((r) => r.root.toLowerCase()));
      k += jurors.length;
    }

    const [{ data: sides }, { data: flags }, { data: votes }, { data: commentRows }] = await Promise.all([
      db().from("sides").select("case_id, role, body, title, content_hash, public_consent").eq("network", dataKey).in("case_id", idStrs),
      db().from("case_flags").select("case_id, hidden, removal_requested_at").eq("network", dataKey).in("case_id", idStrs),
      db().from("crowd_votes").select("case_id, person, vote").eq("network", dataKey).in("case_id", idStrs),
      db()
        .from("comments")
        .select("case_id")
        .eq("network", dataKey)
        .in("case_id", idStrs)
        .eq("hidden", false)
        .is("deleted_at", null),
    ]);

    for (const { id, c, jurors } of joined) {
      const key = id.toString();
      const a = sides?.find((s) => String(s.case_id) === key && s.role === "A" && sameAddress(s.content_hash, c.contentA));
      const b = sides?.find((s) => String(s.case_id) === key && s.role === "B" && sameAddress(s.content_hash, c.contentB));
      const f = flags?.find((x) => String(x.case_id) === key);
      const oneSided = c.mode === 1;
      // Every case is public for now; only admin-hidden (reported, harmful) cases are left out.
      if (!a?.public_consent || (!oneSided && !b?.public_consent) || f?.hidden) continue;

      const caseVotes = votes?.filter((v) => String(v.case_id) === key) ?? [];
      const tally = { a: caseVotes.filter((v) => v.vote === 1).length, b: caseVotes.filter((v) => v.vote === 2).length };
      const official = c.status === 5 || c.status === 6;
      const v = opts.viewer;
      const mine = v?.person ? caseVotes.find((x) => x.person === v.person)?.vote ?? null : null;
      const isParty = Boolean(v?.wallets.some((w) => sameAddress(w, c.partyA) || sameAddress(w, c.partyB)));
      const isJuror = Boolean(
        v?.wallets.some((w) => jurors.some((j) => sameAddress(j, w))) || (v?.person && jurorRootsByCase.get(key)?.includes(v.person)),
      );
      const commentsVisible = commentAccess(c.status, true, { signedIn: Boolean(v), verified: Boolean(v?.person), juror: isJuror }).showCount;

      items.push({
        caseId: key,
        status: c.status,
        speed: c.speed,
        mode: c.mode,
        title: a.title ?? "",
        fee: c.fee.toString(),
        verdict: c.verdict,
        votesA: c.votesA,
        votesB: c.votesB,
        jurorCount: jurors.length,
        commits: c.commits,
        reveals: c.reveals,
        drawDeadline: Number(c.drawDeadline),
        commitDeadline: Number(c.commitDeadline),
        revealDeadline: Number(c.revealDeadline),
        sideA: a.body,
        sideB: oneSided ? null : b!.body,
        crowd: official || mine ? tally : null,
        crowdTotal: tally.a + tally.b,
        myVote: mine,
        viewerRole: isParty ? "party" : isJuror ? "juror" : null,
        comments: commentsVisible ? commentRows?.filter((r) => String(r.case_id) === key).length ?? 0 : null,
        parties: [c.partyA, c.partyB].filter((p) => p !== ZERO_ADDRESS),
      });
      if (items.length >= limit) break;
    }
  }
  const last = items[items.length - 1];
  const more = items.length >= limit ? BigInt(last.caseId) : cursor >= 1n ? cursor + 1n : null;
  return { items, nextBefore: more !== null && more > 1n ? more.toString() : null };
}
