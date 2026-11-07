"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useState } from "react";

export function LoginButton() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const [serverCheck, setServerCheck] = useState<string>();

  if (!ready) return <button className="btn" disabled>Loading…</button>;
  if (!authenticated) {
    return (
      <button className="btn" onClick={login}>
        Sign in
      </button>
    );
  }

  async function checkServer() {
    const token = await getAccessToken();
    const res = await fetch("/api/me", { headers: { authorization: `Bearer ${token}` } });
    setServerCheck(res.ok ? "Server recognises you ✓" : `Server check failed (${res.status})`);
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        Signed in{address ? ` as ${address.slice(0, 6)}…${address.slice(-4)}` : ""}.
      </p>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={checkServer}>Check server sign-in</button>
        <button className="btn-secondary" onClick={logout}>Sign out</button>
      </div>
      {serverCheck && <p className="text-zinc-600">{serverCheck}</p>}
    </div>
  );
}
