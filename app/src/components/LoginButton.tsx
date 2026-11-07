"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useState } from "react";

export function LoginButton() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const [serverCheck, setServerCheck] = useState<string>();

  if (!ready) {
    return (
      <button className="btn" disabled>
        Loading…
      </button>
    );
  }
  if (!authenticated) {
    return (
      <button className="btn" onClick={login}>
        <Gavel /> Sign in to start a case
      </button>
    );
  }

  async function checkServer() {
    const token = await getAccessToken();
    const res = await fetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
    setServerCheck(res.ok ? "Server recognises you ✓" : `Server check failed (${res.status})`);
  }

  return (
    <div className="flex flex-col items-center gap-2 text-sm">
      <p className="font-semibold">
        Signed in{address ? ` as ${address.slice(0, 6)}…${address.slice(-4)}` : ""}
      </p>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={checkServer}>Check server sign-in</button>
        <button className="btn-secondary" onClick={logout}>Sign out</button>
      </div>
      {serverCheck && <p className="text-white/80">{serverCheck}</p>}
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
