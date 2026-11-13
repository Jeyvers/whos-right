import { ContractStatus } from "@/components/ContractStatus";
import { ExampleCases } from "@/components/ExampleCases";
import { LoginButton } from "@/components/LoginButton";
import { Scales } from "@/components/Scales";
import { network } from "@/lib/network";

const MODES = [
  {
    title: "Ask the jury",
    meta: "Just your side",
    body: "Write what happened. The jury says whether you're right or wrong. Only you pay.",
    color: "bg-side-a",
  },
  {
    title: "Settle it together",
    meta: "Both sides",
    body: "Send the other person a private invite. They write their side and pay the same fee. The jury picks a winner.",
    color: "bg-side-b",
  },
];

const STEPS = [
  { title: "Make your case", body: "Write what happened, pick a mode, and pick Standard or Fast." },
  {
    title: "Call them out (optional)",
    body: "Settling it together? Send the private invite. They write their side and pay the same fee.",
  },
  { title: "Jury's drawn", body: "5 verified people are picked at random and vote in secret." },
  { title: "Verdict!", body: "Votes are revealed. Jurors who voted on time share the fees." },
];

export default function Home() {
  return (
    <>
      <section className="bg-court pb-14 pt-8 text-white">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 text-center">
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
            Rest My Case
          </h1>

          <p className="max-w-md rounded-2xl bg-white/10 px-4 py-3 text-base text-white/90 sm:text-lg">
            My roommate took the trash out last night. This morning I spilled a whole pot of soup into the new bag.
            Now it stinks. Who takes it out?
          </p>

          {/* The face-off: side A vs side B, weighed on the scales */}
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
            <div className="-rotate-3 rounded-2xl border-[3px] border-ink bg-side-a px-3 py-4 shadow-[0_6px_0_0_var(--color-ink)]">
              <p className="font-display text-xl font-extrabold sm:text-3xl">Me</p>
              <p className="text-sm font-semibold text-white/90">&ldquo;It&apos;s her week. She takes it out.&rdquo;</p>
            </div>
            <Scales animated className="h-28 w-28 drop-shadow-[0_4px_0_rgba(27,16,53,0.35)] sm:h-36 sm:w-36" />
            <div className="rotate-3 rounded-2xl border-[3px] border-ink bg-side-b px-3 py-4 shadow-[0_6px_0_0_var(--color-ink)]">
              <p className="font-display text-xl font-extrabold sm:text-3xl">Roommate</p>
              <p className="text-sm font-semibold text-white/90">&ldquo;You made the mess. You take it out.&rdquo;</p>
            </div>
          </div>

          <p className="max-w-md text-lg text-white/90">
            Can&apos;t agree? Put it to a jury. 5 random, verified people read both sides, vote in secret, and settle
            it. Small fee in G$. No verdict, money back.
          </p>
          <LoginButton />
        </div>
      </section>

      <div className="mx-auto flex max-w-2xl flex-col gap-12 px-4 py-10">
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold">You be the jury</h2>
            <p className="text-ink/70">Real kinds of arguments people bring. Read the story, pick a side.</p>
          </div>
          <ExampleCases />
          <p className="text-sm text-ink/60">
            Cases are public, so describe people by role (&ldquo;my roommate&rdquo;), never by name. A verdict is
            an honest outside opinion, not a legal ruling.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-extrabold">Two ways to settle it</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODES.map((m) => (
              <div key={m.title} className="tile flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full border-2 border-ink ${m.color}`} />
                  <p className="font-display text-lg font-extrabold">{m.title}</p>
                  <span className="text-sm text-ink/60">{m.meta}</span>
                </div>
                <p className="text-sm text-ink/75">{m.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-extrabold">Pick your speed</h2>
          <ContractStatus />
          <p className="text-sm text-ink/60">Live from {network.label}.</p>
        </section>

        <section className="flex flex-col gap-5">
          <h2 className="font-display text-2xl font-extrabold">How a case plays out</h2>
          <ol className="relative flex flex-col gap-5 before:absolute before:bottom-12 before:left-[1.35rem] before:top-6 before:border-l-4 before:border-dashed before:border-court/30">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex items-start gap-4">
                <span
                  className={`z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-ink font-display text-lg font-extrabold ${
                    i === STEPS.length - 1 ? "bg-verdict" : "bg-white"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="pt-1.5">
                  <p className="font-display text-lg font-bold">{s.title}</p>
                  <p className="text-ink/75">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="tile flex flex-col gap-2 p-5">
          <h2 className="font-display text-2xl font-extrabold">Or sit on the jury</h2>
          <p className="text-ink/75">
            Join the jury pool for free and get drawn at random to decide real cases. Vote on time and you share
            the fees from that case. Leave any time.
          </p>
        </section>
      </div>
    </>
  );
}
