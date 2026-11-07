"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useEffect, useRef } from "react";
import type { FeedPage } from "@/lib/crowd";
import { CaseCard } from "./CaseCard";
import { Loading } from "./Loading";

/** Every few cases, a nudge to bring your own argument. */
function StartCaseCard() {
  return (
    <aside className="tile flex flex-col items-start gap-2 bg-verdict p-4">
      <p className="font-display text-xl font-extrabold">Got your own argument?</p>
      <p>Put it to a jury of real people. You both pay a small fee, and if there&apos;s no verdict you both get it back.</p>
      <Link href="/new" className="btn bg-white">Start a case</Link>
    </aside>
  );
}

/** The public, endless feed of cases to judge. Readable signed out; voting asks you to sign in. */
export function CaseFeed({ emptyHint, exclude }: { emptyHint?: string; exclude?: string }) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const feed = useInfiniteQuery({
    queryKey: ["feed", authenticated],
    enabled: ready,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      const headers: Record<string, string> = {};
      const token = authenticated ? await getAccessToken() : null;
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(`/api/feed${pageParam ? `?before=${pageParam}` : ""}`, { headers });
      if (!res.ok) throw new Error("Couldn't load cases.");
      return res.json();
    },
    getNextPageParam: (last) => last.nextBefore,
    refetchInterval: 30_000,
  });

  // Load more when the bottom of the feed scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (feed.isLoading || !ready) return <div className="py-10"><Loading size="lg" label="Gathering cases…" /></div>;
  if (feed.isError) return <p className="tile p-4">Couldn&apos;t load cases. Pull down or refresh to try again.</p>;

  const items = (feed.data?.pages.flatMap((p) => p.items) ?? []).filter((it) => it.caseId !== exclude);
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="tile p-4 text-ink/70">{emptyHint ?? "No cases to judge right now. New ones land here as people bring them."}</p>
        <StartCaseCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {items.map((it, i) => (
        <Fragment key={it.caseId}>
          <CaseCard it={it} />
          {i % 5 === 4 && <StartCaseCard />}
        </Fragment>
      ))}
      <div ref={sentinel} aria-hidden />
      {isFetchingNextPage && <Loading label="Loading more cases…" />}
      {!hasNextPage && items.length > 3 && <p className="py-4 text-center text-sm text-ink/50">You&apos;re all caught up.</p>}
    </div>
  );
}
