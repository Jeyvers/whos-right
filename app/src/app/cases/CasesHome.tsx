"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CaseFeed } from "@/components/CaseFeed";
import { Page } from "@/components/ui";
import { MyCases } from "./MyCases";

/** Cases: the public "Needs judging" feed (anyone can read and vote) and your own cases. */
export function CasesHome() {
  const tab = useSearchParams().get("tab") === "mine" ? "mine" : "feed";
  const tabClass = (on: boolean) =>
    `flex-1 rounded-xl px-3 py-2 text-center font-display font-extrabold ${on ? "bg-ink text-white" : "text-ink/70"}`;
  return (
    <Page>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{tab === "feed" ? "Who's right here?" : "My cases"}</h1>
        <p className="text-ink/70">
          {tab === "feed"
            ? "Read both sides and pick. A random jury of verified people gives the official verdict; see if you called it."
            : "Your calls, money waiting, and every case you opened, joined or judged."}
        </p>
      </div>
      <nav className="sticky top-2 z-10 flex gap-1 rounded-2xl border-[3px] border-ink bg-white p-1 shadow-[0_4px_0_0_var(--color-ink)]">
        <Link href="/cases" className={tabClass(tab === "feed")} aria-current={tab === "feed" ? "page" : undefined}>Needs judging</Link>
        <Link href="/cases?tab=mine" className={tabClass(tab === "mine")} aria-current={tab === "mine" ? "page" : undefined}>My cases</Link>
      </nav>
      {tab === "feed" ? <CaseFeed /> : <MyCases />}
    </Page>
  );
}
