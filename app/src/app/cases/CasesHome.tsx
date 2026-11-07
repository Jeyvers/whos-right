"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CaseFeed } from "@/components/CaseFeed";
import { Page } from "@/components/ui";
import { usePrivy } from "@privy-io/react-auth";
import { PoolBanner } from "@/components/PoolBanner";
import { MyCases } from "./MyCases";

/** Signed out: what being in the jury pool means, one tap from signing in (and joining, via ?join=1). */
function JoinPoolPitch() {
  const { login } = usePrivy();
  return (
    <div className="tile flex flex-col gap-2 bg-verdict p-4">
      <p className="font-display text-xl font-extrabold">Get paid to judge</p>
      <p className="text-sm">
        Anyone can vote below. Join the jury pool and you can also be drawn for official, paid verdicts.
      </p>
      <Link
        href="/cases?join=1"
        onClick={() => login()}
        className="btn self-start bg-white"
      >
        Sign in and join the jury
      </Link>
    </div>
  );
}

/** Cases: the public "Needs judging" feed (anyone can read and vote) and your own cases. */
export function CasesHome() {
  const { ready, authenticated } = usePrivy();
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
      {tab === "feed" ? (
        <>
          {ready && (authenticated ? <PoolBanner /> : <JoinPoolPitch />)}
          <CaseFeed />
        </>
      ) : (
        <MyCases />
      )}
    </Page>
  );
}
