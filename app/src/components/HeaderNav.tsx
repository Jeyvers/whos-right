"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";

export function HeaderNav() {
  const { ready, authenticated, login } = usePrivy();
  if (!ready) return null;
  if (!authenticated) {
    return (
      <nav className="flex items-center gap-3 text-sm font-bold">
        <Link href="/cases" className="hover:underline underline-offset-4">Cases</Link>
        <button onClick={login} className="rounded-full border-2 border-ink bg-white px-3 py-0.5 text-ink">
          Sign in
        </button>
      </nav>
    );
  }
  return (
    <nav className="flex items-center gap-3 text-sm font-bold">
      <Link href="/cases" className="hover:underline underline-offset-4">Cases</Link>
      <Link href="/jury" className="hover:underline underline-offset-4">Jury</Link>
      <Link href="/account" className="hover:underline underline-offset-4">Account</Link>
    </nav>
  );
}
