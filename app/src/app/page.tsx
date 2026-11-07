import { ContractStatus } from "@/components/ContractStatus";
import { LoginButton } from "@/components/LoginButton";
import { Scales } from "@/components/Scales";
import { network } from "@/lib/network";

const STEPS = [
  { title: "Make your case", body: "Write your side and pick Standard or Fast." },
  { title: "Call them out", body: "Send the private invite. They write their side and pay the same fee." },
  { title: "Jury's drawn", body: "5 verified people are picked at random and vote in secret." },
  { title: "Verdict!", body: "Votes are revealed. Jurors who voted on time share the fees." },
];

export default function Home() {
  return (
    <>
      <section className="bg-court pb-14 pt-8 text-white">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 text-center">
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
            Who&apos;s Right?
          </h1>

          {/* The face-off: side A vs side B, weighed on the scales */}
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
            <div className="-rotate-3 rounded-2xl border-[3px] border-ink bg-side-a px-3 py-4 shadow-[0_6px_0_0_var(--color-ink)]">
              <p className="font-display text-2xl font-extrabold sm:text-3xl">You</p>
              <p className="text-sm font-semibold text-white/90">&ldquo;I&apos;m right.&rdquo;</p>
            </div>
            <Scales animated className="h-28 w-28 drop-shadow-[0_4px_0_rgba(27,16,53,0.35)] sm:h-36 sm:w-36" />
            <div className="rotate-3 rounded-2xl border-[3px] border-ink bg-side-b px-3 py-4 shadow-[0_6px_0_0_var(--color-ink)]">
              <p className="font-display text-2xl font-extrabold sm:text-3xl">Them</p>
              <p className="text-sm font-semibold text-white/90">&ldquo;No, I am.&rdquo;</p>
            </div>
          </div>

          <p className="max-w-md text-lg text-white/90">
            Settle it for real. You each pay the same small fee, and a jury of randomly picked, verified humans
            decides. No verdict? You both get your money back.
          </p>
          <LoginButton />
        </div>
      </section>

      <div className="mx-auto flex max-w-2xl flex-col gap-12 px-4 py-10">
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
      </div>
    </>
  );
}
