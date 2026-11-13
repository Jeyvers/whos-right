"use client";

import { useState } from "react";

type Example = {
  story: string;
  /** Two-sided: two people, two quotes. One-sided: just the story, the jury says Right or Wrong. */
  a: { who: string; says: string };
  b?: { who: string; says: string };
};

const EXAMPLES: Example[] = [
  {
    story:
      "Three of us shared a taxi home. I got dropped off first, halfway there. Now they want to split the fare three ways.",
    a: { who: "Me", says: "I only rode half the way. I should pay less." },
    b: { who: "My friends", says: "We always split it evenly. Same as everyone." },
  },
  {
    story:
      "We bet on the final score being 2-1. It was 1-1 after 90 minutes and ended 2-1 in extra time.",
    a: { who: "Me", says: "It finished 2-1. I win the bet." },
    b: { who: "My friend", says: "Bets are on 90 minutes. It was a draw. I win." },
  },
  {
    story:
      "I lent my friend my phone charger. A week later it stopped working while she had it.",
    a: { who: "Me", says: "It broke while you had it. You replace it." },
    b: { who: "My friend", says: "It was old and frayed. It was going to die anyway." },
  },
  {
    story:
      "My partner cancelled our dinner reservation an hour before, to go to drinks with his boss.",
    a: { who: "Me", says: "You don't cancel on me an hour before." },
    b: { who: "My partner", says: "It was my boss. I couldn't say no." },
  },
  {
    story:
      "My cousin's wedding was on the same day as my final exam, so I skipped the wedding. Half the family isn't talking to me.",
    a: { who: "Me", says: "I couldn't move the exam. Am I wrong?" },
  },
];

function Choice(props: {
  label: string;
  tone: "a" | "b";
  picked: boolean;
  dimmed: boolean;
  onPick: () => void;
}) {
  const bg = props.tone === "a" ? "bg-side-a" : "bg-side-b";
  return (
    <button
      type="button"
      onClick={props.onPick}
      aria-pressed={props.picked}
      className={`flex-1 rounded-2xl border-[3px] border-ink px-3 py-2 font-display text-base font-extrabold text-white shadow-[0_3px_0_0_var(--color-ink)] transition-[transform,box-shadow,opacity] duration-75 active:translate-y-[3px] active:shadow-none ${bg} ${
        props.dimmed ? "opacity-40" : ""
      } ${props.picked ? "ring-4 ring-verdict" : ""}`}
    >
      {props.label}
    </button>
  );
}

function ExampleCard({ ex, n }: { ex: Example; n: number }) {
  const [pick, setPick] = useState<"a" | "b" | null>(null);
  const oneSided = !ex.b;
  const sides = ex.b ? [ex.a, ex.b] : [ex.a];

  return (
    <li className="tile flex flex-col gap-3 p-4">
      <span className="text-xs font-bold uppercase tracking-wide text-court">Story {n}</span>
      <p className="text-ink/85">{ex.story}</p>

      <div className={`grid gap-2 ${oneSided ? "" : "sm:grid-cols-2"}`}>
        {sides.map((s, i) => (
          <div
            key={s.who}
            className={`rounded-2xl border-[3px] border-ink px-3 py-2 text-white ${i === 0 ? "bg-side-a" : "bg-side-b"}`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-white/85">
              {oneSided ? s.who : `${i === 0 ? "A" : "B"} · ${s.who}`}
            </p>
            <p className="font-semibold">&ldquo;{s.says}&rdquo;</p>
          </div>
        ))}
      </div>

      <p className="font-display text-lg font-extrabold">{oneSided ? "Right or wrong?" : "Who's right?"}</p>
      <div className="flex gap-2">
        <Choice
          label={oneSided ? "Right" : "A"}
          tone="a"
          picked={pick === "a"}
          dimmed={pick === "b"}
          onPick={() => setPick("a")}
        />
        <Choice
          label={oneSided ? "Wrong" : "B"}
          tone="b"
          picked={pick === "b"}
          dimmed={pick === "a"}
          onPick={() => setPick("b")}
        />
      </div>
      {pick && (
        <p className="text-sm text-ink/70">
          That&apos;s exactly what a juror does. On a real case, 5 random people vote like this in secret, and the
          majority decides.
        </p>
      )}
    </li>
  );
}

export function ExampleCases() {
  return (
    <ul className="flex flex-col gap-4">
      {EXAMPLES.map((ex, i) => (
        <ExampleCard key={ex.story} ex={ex} n={i + 1} />
      ))}
    </ul>
  );
}
