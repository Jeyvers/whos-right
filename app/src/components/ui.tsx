import type { ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">{children}</div>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{children}</h1>
      {sub && <p className="text-ink/70">{sub}</p>}
    </div>
  );
}

export function Panel({ children, tone = "white" }: { children: ReactNode; tone?: "white" | "yellow" | "court" }) {
  const bg = tone === "yellow" ? "bg-verdict" : tone === "court" ? "bg-court text-white" : "bg-white";
  return <section className={`tile flex flex-col gap-3 p-5 ${bg}`}>{children}</section>;
}

export function ErrorNote({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border-2 border-side-a bg-side-a/10 px-3 py-2 font-semibold text-ink">
      {children}
    </p>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink/65">{children}</p>;
}

const PILL: Record<string, string> = {
  Open: "bg-white",
  Joined: "bg-verdict",
  Drawing: "bg-verdict",
  Voting: "bg-side-b text-white",
  Resolved: "bg-court text-white",
  Refunded: "bg-zinc-200",
};
const PILL_TEXT: Record<string, string> = {
  Open: "Waiting for the other side",
  Joined: "Ready for a jury",
  Drawing: "Drawing the jury",
  Voting: "Jury is voting",
  Resolved: "Verdict is in",
  Refunded: "Refunded",
};
export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${PILL[status] ?? ""}`}>
      {PILL_TEXT[status] ?? status}
    </span>
  );
}

export function SideCard({ side, label, text, highlight }: { side: "A" | "B"; label: string; text: ReactNode; highlight?: boolean }) {
  const color = side === "A" ? "bg-side-a" : "bg-side-b";
  return (
    <div className={`tile overflow-hidden ${highlight ? "ring-4 ring-verdict" : ""}`}>
      <p className={`${color} border-b-[3px] border-ink px-4 py-2 font-display text-lg font-extrabold text-white`}>{label}</p>
      <div className="whitespace-pre-wrap px-4 py-3 leading-relaxed">{text}</div>
    </div>
  );
}
