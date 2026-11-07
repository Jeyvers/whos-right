"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { Hex } from "viem";
import { ErrorNote, Hint, Panel } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { useNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { VOTE, timeLeft, type ChainCase } from "@/lib/cases";
import { friendlyError } from "@/lib/errors";
import { network } from "@/lib/network";
import { Spinner } from "@/components/Loading";
import {
  commitmentOf,
  loadLocalSalt,
  randomSalt,
  saltFromSignature,
  saveLocalSalt,
  voteKeyMessage,
} from "@/lib/voteKey";

type MyVote = { root: string; commitment: Hex; vote: number; revealed: boolean };

export function VotePanel(props: { caseId: bigint; c: ChainCase; jurors: readonly string[]; myVote: MyVote; onDone: () => void }) {
  const { caseId, c, jurors, myVote, onDone } = props;
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const authFetch = useAuthFetch();
  const sendTx = useTx();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const wr = network.whosRight!;

  const oneSided = c.mode === 1;
  const committed = myVote.commitment !== `0x${"0".repeat(64)}`;
  const revealOpen = now > Number(c.commitDeadline) || c.commits === jurors.length;
  const commitOpen = !committed && now <= Number(c.commitDeadline);
  const revealNow = committed && !myVote.revealed && revealOpen && now <= Number(c.revealDeadline);

  /** Vote key for committing: signature-derived if this wallet's signatures repeat, else the disclosed fallback. */
  async function keyForCommit(juror: `0x${string}`): Promise<Hex> {
    const local = loadLocalSalt(caseId, juror);
    if (local) return local;
    const msg = voteKeyMessage(caseId);
    const sig1 = await signMessageAsync({ message: msg });
    const sig2 = await signMessageAsync({ message: msg });
    let salt: Hex;
    if (sig1 === sig2) {
      salt = saltFromSignature(sig1);
    } else {
      const ok = window.confirm(
        "Your wallet doesn't make repeatable signatures, so your secret vote key has to be saved on our server. " +
          "That means we could see your vote before the reveal. Continue?",
      );
      if (!ok) throw new Error("Vote not sent.");
      salt = randomSalt();
      await authFetch("/api/salts", { method: "POST", body: JSON.stringify({ caseId: caseId.toString(), juror, salt }) });
      setFallbackUsed(true);
    }
    saveLocalSalt(caseId, juror, salt);
    return salt;
  }

  /** Finds the key and the vote that match the on-chain commitment. */
  async function recoverForReveal(juror: `0x${string}`): Promise<{ salt: Hex; vote: number }> {
    const match = (salt: Hex) =>
      [VOTE.A, VOTE.B].find((v) => commitmentOf(caseId, juror, v, salt) === myVote.commitment);
    const candidates: (() => Promise<Hex | null>)[] = [
      async () => loadLocalSalt(caseId, juror),
      async () => saltFromSignature(await signMessageAsync({ message: voteKeyMessage(caseId) })),
      async () =>
        (await authFetch<{ salt: Hex | null }>(`/api/salts?caseId=${caseId}&juror=${juror}`)).salt,
    ];
    for (const get of candidates) {
      const salt = await get();
      const vote = salt ? match(salt) : undefined;
      if (salt && vote) return { salt, vote };
    }
    throw new Error("Couldn't find your vote key. Open this page on the device and wallet you voted with.");
  }

  async function commit(vote: number) {
    if (!address) return;
    setBusy(true);
    setError(undefined);
    try {
      const salt = await keyForCommit(address);
      await sendTx({ address: wr, abi: whosRightAbi, functionName: "commitVote", args: [caseId, commitmentOf(caseId, address, vote, salt)] });
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    if (!address) return;
    setBusy(true);
    setError(undefined);
    try {
      const { salt, vote } = await recoverForReveal(address);
      await sendTx({ address: wr, abi: whosRightAbi, functionName: "revealVote", args: [caseId, vote, salt] });
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel tone="yellow">
      <p className="font-display text-2xl font-extrabold">You&apos;re on the jury!</p>
      {commitOpen && (
        <>
          <p>
            {oneSided
              ? "You only have one side of the story. Are they right or wrong? Your vote stays secret until everyone has voted."
              : "Read both sides, then pick who's right. Your vote stays secret until everyone has voted."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button className={`btn text-white ${oneSided ? "bg-side-b" : "bg-side-a"}`} disabled={busy} onClick={() => commit(VOTE.A)}>
              {oneSided ? "Right" : "First side"}
            </button>
            <button className={`btn text-white ${oneSided ? "bg-side-a" : "bg-side-b"}`} disabled={busy} onClick={() => commit(VOTE.B)}>
              {oneSided ? "Wrong" : "Their side"}
            </button>
          </div>
          <Hint>
            {timeLeft(c.commitDeadline, now)} left to vote. Your wallet asks you to sign twice: that creates your secret
            vote key and costs nothing.
          </Hint>
        </>
      )}
      {committed && !revealOpen && <p>Your vote is locked in 🔒. Come back to reveal it once everyone has voted.</p>}
      {revealNow && (
        <>
          <p>Everyone has voted. Reveal yours so it counts and you get paid.</p>
          <button className="btn self-start bg-white" disabled={busy} onClick={reveal}>{busy ? <><Spinner /> Revealing…</> : "Reveal my vote"}</button>
          <Hint>{timeLeft(c.revealDeadline, now)} left to reveal. Jurors who don&apos;t reveal aren&apos;t paid.</Hint>
        </>
      )}
      {myVote.revealed && <p>Vote revealed ✓. Your share arrives when the verdict is announced.</p>}
      {!committed && !commitOpen && <p>The voting window closed before you voted.</p>}
      {fallbackUsed && (
        <Hint>
          Your wallet doesn&apos;t make repeatable signatures, so your vote key was saved on our server. That means we
          could see your vote before the reveal.
        </Hint>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}
