"use client";

import Link from "next/link";
import { useState } from "react";
import { calledIt, type FeedItem } from "@/lib/crowd";
import { SPEED, timeLeft } from "@/lib/cases";
import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { useCrowdVote } from "@/hooks/useCrowdVote";
import { useNow } from "@/hooks/useNow";
import { Spinner } from "./Loading";
import { ErrorNote } from "./ui";

function stageLine(it: FeedItem, now: number): string {
  if (it.status === 2) return "Calling the jury";
  if (it.status === 3) return "Drawing the jury";
  if (it.status === 4) {
    const revealOpen = now > it.commitDeadline || it.commits === it.jurorCount;
    return revealOpen
      ? `Jury revealing · ${timeLeft(BigInt(it.revealDeadline), now)} left`
      : `Jury voting · ${timeLeft(BigInt(it.commitDeadline), now)} left`;
  }
  if (it.status === 5) return "Verdict is in";
  return "No verdict";
}

function Side({ side, text, chosen, winner }: { side: "A" | "B"; text: string; chosen: boolean; winner: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260;
  const color = side === "A" ? "border-side-a" : "border-side-b";
  const badge = side === "A" ? "bg-side-a" : "bg-side-b";
  return (
    <div className={`rounded-2xl border-[3px] bg-white p-3 ${color} ${winner ? "ring-4 ring-verdict" : ""}`}>
      <p className="mb-1 flex items-center gap-2 text-sm font-bold">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink font-display text-white ${badge}`}>{side}</span>
        Side {side}
        {chosen && <span className="ml-auto rounded-full bg-ink px-2 py-0.5 text-xs text-white">Your pick</span>}
        {winner && <span className="ml-auto rounded-full bg-verdict px-2 py-0.5 text-xs">Jury&apos;s pick</span>}
      </p>
      <p className={`whitespace-pre-wrap leading-relaxed ${!open && long ? "line-clamp-5" : ""}`}>{text}</p>
      {long && (
        <button className="mt-1 text-sm font-bold text-court underline-offset-4 hover:underline" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

export function CrowdBar({ a, b }: { a: number; b: number }) {
  const total = a + b;
  if (total === 0) return <p className="text-sm text-ink/60">No crowd votes on this one.</p>;
  const pa = Math.round((a / total) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-7 overflow-hidden rounded-full border-2 border-ink text-xs font-bold text-white" aria-label={`Crowd: A ${pa}%, B ${100 - pa}%`}>
        {a > 0 && <div className="flex items-center bg-side-a pl-2" style={{ width: `${pa}%` }}>A {pa}%</div>}
        {b > 0 && <div className="flex flex-1 items-center justify-end bg-side-b pr-2">B {100 - pa}%</div>}
      </div>
      <p className="text-xs text-ink/60">The crowd: {total} {total === 1 ? "vote" : "votes"}</p>
    </div>
  );
}

/** One case in the feed: read both sides, pick who's right, see if you called it. */
export function CaseCard({ it }: { it: FeedItem }) {
  const now = useNow(30_000);
  const { myVote, cast, busy, error } = useCrowdVote(it.caseId, it.myVote);
  const decided = it.status === 5 || it.status === 6;
  const winner = it.status === 5 ? (it.verdict === 1 ? "A" : "B") : null;
  const called = calledIt(myVote, it.status, it.verdict);
  const canVote = !decided && !myVote && !it.viewerRole;

  return (
    <article className="tile flex flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/c/${it.caseId}`} className="font-display text-lg font-extrabold hover:underline underline-offset-4">
          Case #{it.caseId}
        </Link>
        <span className="rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold">
          {it.speed === SPEED.Fast ? "⚡ Fast" : "Standard"} · {formatG(BigInt(it.fee))} {network.tokenSymbol} each
        </span>
        <span className="ml-auto font-semibold text-ink/70">{stageLine(it, now)}</span>
      </header>

      <Side side="A" text={it.sideA} chosen={myVote === 1} winner={winner === "A"} />
      <div className="-my-1 text-center font-display text-sm font-extrabold text-ink/40" aria-hidden>VS</div>
      <Side side="B" text={it.sideB} chosen={myVote === 2} winner={winner === "B"} />

      {it.viewerRole === "party" && <p className="rounded-xl bg-lilac p-3 text-sm font-semibold">This is your case. Sit tight while the jury decides.</p>}
      {it.viewerRole === "juror" && !decided && (
        <Link href={`/c/${it.caseId}`} className="btn bg-verdict">You&apos;re on this jury: cast your official vote</Link>
      )}

      {canVote && (
        <div className="flex flex-col gap-2">
          <p className="text-center font-display font-bold">Who&apos;s right?</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn bg-side-a text-white" disabled={busy} onClick={() => cast(1)}>{busy ? <Spinner /> : "A is right"}</button>
            <button className="btn bg-side-b text-white" disabled={busy} onClick={() => cast(2)}>{busy ? <Spinner /> : "B is right"}</button>
          </div>
        </div>
      )}

      {myVote && !decided && (
        <p className="rounded-xl bg-lilac p-3 text-sm">
          <strong>You said {myVote === 1 ? "A" : "B"}.</strong> The crowd&apos;s results show once the jury decides
          {it.crowdTotal > 1 ? ` · ${it.crowdTotal} people have weighed in` : ""}.
        </p>
      )}

      {decided && (
        <div className="flex flex-col gap-2 rounded-2xl bg-court p-3 text-white">
          <p className="font-display text-lg font-extrabold">
            {winner ? `Jury: Side ${winner} wins ${it.votesA}–${it.votesB}` : "No verdict. Both sides were refunded."}
          </p>
          {called !== null && (
            <p className={`self-start rounded-full px-3 py-1 text-sm font-extrabold ${called ? "bg-verdict text-ink" : "bg-white/15"}`}>
              {called ? "You called it ✓" : "The jury disagreed with you ✗"}
            </p>
          )}
          {it.crowd && (
            <div className="rounded-xl bg-white p-2 text-ink">
              <CrowdBar a={it.crowd.a} b={it.crowd.b} />
            </div>
          )}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </article>
  );
}
