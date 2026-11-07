"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { Spinner } from "./Loading";

/** Home page call to action. */
export function LoginButton() {
  const { ready, authenticated, login } = usePrivy();
  if (!ready) {
    return <button className="btn" disabled><Spinner /> Loading…</button>;
  }
  if (!authenticated) {
    return (
      <div className="flex flex-wrap justify-center gap-3">
        <button className="btn" onClick={login}>
          <Gavel /> Sign in to start a case
        </button>
        <Link href="/cases" className="btn bg-white">Judge cases</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Link href="/new" className="btn"><Gavel /> Start a case</Link>
      <Link href="/cases?join=1" className="btn bg-white">Be a juror</Link>
    </div>
  );
}

function Gavel() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <g fill="#1B1035">
        <rect x="9" y="1.5" width="11" height="6" rx="1.5" transform="rotate(45 14.5 4.5)" />
        <rect x="2" y="12" width="10" height="3.2" rx="1.6" transform="rotate(-45 7 13.6)" />
        <rect x="3" y="19.5" width="11" height="3" rx="1.2" />
      </g>
    </svg>
  );
}
