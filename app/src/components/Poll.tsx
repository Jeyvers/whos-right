"use client";

import { Spinner } from "./Loading";

/**
 * Twitter-style poll. Before you vote: two rounded options. After you vote (or once the verdict is in): the same
 * options fill to their share, with a check on your pick and the jury's pick marked.
 */
export function Poll(props: {
  labels: [string, string];
  /** null = results hidden (you haven't voted and there's no verdict yet). */
  tally: { a: number; b: number } | null;
  myVote: number | null;
  /** 1 or 2 once the jury has decided. */
  juryPick: number | null;
  canVote: boolean;
  busy: boolean;
  onVote: (v: 1 | 2) => void;
}) {
  const { labels, tally, myVote, juryPick, canVote, busy, onVote } = props;
  const showResults = tally !== null && (myVote !== null || juryPick !== null || !canVote);

  if (!showResults) {
    if (!canVote) return null;
    return (
      <div className="flex flex-col gap-2">
        {([1, 2] as const).map((v) => (
          <button
            key={v}
            disabled={busy}
            onClick={() => onVote(v)}
            className="flex h-11 items-center justify-center gap-2 rounded-full border-2 border-court font-display font-extrabold text-court transition-colors hover:bg-court hover:text-white disabled:opacity-60"
          >
            {busy ? <Spinner /> : labels[v - 1]}
          </button>
        ))}
      </div>
    );
  }

  const total = tally.a + tally.b;
  if (total === 0) return <p className="text-sm text-ink/70">No one from the public voted on this one.</p>;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const rows: [1 | 2, number][] = [
    [1, tally.a],
    [2, tally.b],
  ];
  const leader = tally.a === tally.b ? 0 : tally.a > tally.b ? 1 : 2;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([v, n]) => (
        <div key={v} className="relative flex h-10 items-center overflow-hidden rounded-xl bg-lilac">
          <div
            className={`absolute inset-y-0 left-0 rounded-xl transition-[width] duration-700 ease-out ${leader === v ? "bg-verdict" : "bg-ink/10"}`}
            style={{ width: `${pct(n)}%` }}
          />
          <span className="relative flex flex-1 items-center gap-2 px-3 font-bold">
            {labels[v - 1]}
            {myVote === v && <span aria-label="your vote">✓</span>}
            {juryPick === v && <span className="rounded-full bg-court px-2 py-0.5 text-xs text-white">⚖️ Jury</span>}
          </span>
          <span className="relative px-3 font-display font-extrabold tabular-nums">{pct(n)}%</span>
        </div>
      ))}
    </div>
  );
}
