"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useAccount } from "wagmi";
import { calledIt, type FeedItem } from "@/lib/crowd";
import { sameAddress, SPEED, timeLeft } from "@/lib/cases";
import { useCrowdVote } from "@/hooks/useCrowdVote";
import { useNow } from "@/hooks/useNow";
import { Poll } from "./Poll";
import { Scales } from "./Scales";
import { ErrorNote } from "./ui";

function stageLine(it: FeedItem, now: number): string {
  if (it.status === 2 || it.status === 3) return "Drawing the jury";
  if (it.status === 4) {
    const revealOpen = now > it.commitDeadline || it.commits === it.jurorCount;
    return revealOpen
      ? `Jury revealing · ${timeLeft(BigInt(it.revealDeadline), now)} left`
      : `Jury voting · ${timeLeft(BigInt(it.commitDeadline), now)} left`;
  }
  if (it.status === 5) return "Verdict is in";
  return "No verdict";
}

/** Older, simple bar (kept for the case page's crowd results). */
export function CrowdBar({ a, b, labels = ["First", "Theirs"] }: { a: number; b: number; labels?: [string, string] }) {
  const total = a + b;
  if (total === 0) return <p className="text-sm text-ink/60">No public votes on this one.</p>;
  const pa = Math.round((a / total) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-7 overflow-hidden rounded-full border-2 border-ink text-xs font-bold text-white" aria-label={`Crowd: ${labels[0]} ${pa}%, ${labels[1]} ${100 - pa}%`}>
        {a > 0 && <div className="flex items-center bg-side-a pl-2" style={{ width: `${pa}%` }}>{labels[0]} {pa}%</div>}
        {b > 0 && <div className="flex flex-1 items-center justify-end bg-side-b pr-2">{labels[1]} {100 - pa}%</div>}
      </div>
      <p className="text-xs text-ink/60">{total} {total === 1 ? "vote" : "votes"}</p>
    </div>
  );
}

/** One case in the feed, laid out like a post with a poll: read, tap a side, see where everyone landed. */
export function CaseCard({ it }: { it: FeedItem }) {
  const now = useNow(30_000);
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const { myVote, cast, busy, error } = useCrowdVote(it.caseId, it.myVote);
  const decided = it.status === 5 || it.status === 6;
  const oneSided = it.mode === 1;
  const juryPick = it.status === 5 ? it.verdict : null;
  const called = calledIt(myVote, it.status, it.verdict);
  // Your own case, recognised both by the server and instantly here (in case the page loaded before sign-in did).
  const isParty = it.viewerRole === "party" || it.parties.some((p) => sameAddress(p, address));
  const isJuror = it.viewerRole === "juror";
  const walletLoading = authenticated && !address;
  const canVote = !decided && !isParty && !isJuror && !walletLoading;
  const labels: [string, string] = oneSided ? ["Right", "Wrong"] : ["First side", "Their side"];
  const votes = it.crowd ? it.crowd.a + it.crowd.b : it.crowdTotal;

  async function share() {
    const url = `${window.location.origin}/c/${it.caseId}`;
    const text = it.title ? `Which side wins? "${it.title}"` : "Which side wins? Help decide this case";
    if (navigator.share) await navigator.share({ title: "Rest My Case", text, url }).catch(() => {});
    else await navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <article className="flex gap-3 px-4 py-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lilac">
        <Scales className="h-8 w-8" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <header className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-bold">{isParty ? "You" : "Anonymous"}</span>
          <Link href={`/c/${it.caseId}`} className="text-ink/55 hover:underline">· Case #{it.caseId}</Link>
          <span className="text-ink/55">· {stageLine(it, now)}</span>
          {it.speed === SPEED.Fast && <span className="text-ink/55">· ⚡</span>}
        </header>

        <Link href={`/c/${it.caseId}`} className="flex flex-col gap-2">
          {it.title && <h3 className="font-display text-lg font-extrabold leading-snug">{it.title}</h3>}
          {oneSided ? (
            <>
              <p className="whitespace-pre-wrap leading-relaxed">{it.sideA}</p>
              <p className="text-xs font-bold text-ink/50">Only one side of the story</p>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="border-l-4 border-side-a pl-3">
                <p className="text-xs font-bold text-ink/50">First side</p>
                <p className="whitespace-pre-wrap leading-relaxed">{it.sideA}</p>
              </div>
              <div className="border-l-4 border-side-b pl-3">
                <p className="text-xs font-bold text-ink/50">Their side</p>
                <p className="whitespace-pre-wrap leading-relaxed">{it.sideB}</p>
              </div>
            </div>
          )}
        </Link>

        <Poll labels={labels} tally={it.crowd} myVote={myVote} juryPick={juryPick} canVote={canVote} busy={busy} onVote={cast} />

        {isJuror && !decided && (
          <Link href={`/c/${it.caseId}`} className="btn self-start bg-verdict py-2 text-base">You&apos;re on this jury: cast your official vote</Link>
        )}
        {called !== null && (
          <p className={`self-start rounded-full px-3 py-1 text-sm font-extrabold ${called ? "bg-verdict" : "bg-ink/10"}`}>
            {called ? "You called it ✓" : "The jury disagreed with you ✗"}
          </p>
        )}
        {it.status === 6 && <p className="text-sm text-ink/60">No verdict: everyone who paid was refunded.</p>}
        <ErrorNote>{error}</ErrorNote>

        <footer className="flex items-center justify-between text-sm text-ink/55">
          <span>
            {votes} {votes === 1 ? "vote" : "votes"}
            {isParty && !decided ? " · your case" : ""}
          </span>
          <span className="flex items-center gap-1">
          {it.comments !== null && (
            <Link href={`/c/${it.caseId}#comments`} className="rounded-full px-2 py-1 font-semibold hover:bg-lilac" aria-label={`${it.comments} comments`}>
              💬 {it.comments}
            </Link>
          )}
          <button onClick={share} className="rounded-full px-2 py-1 font-semibold hover:bg-lilac" aria-label="Share this case">
            ↗ Share
          </button>
          </span>
        </footer>
      </div>
    </article>
  );
}
