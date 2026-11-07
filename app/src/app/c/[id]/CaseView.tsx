"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { getGasPrice, readContract } from "wagmi/actions";
import { ErrorNote, Hint, Page, Panel, SideCard, StatusPill, Title } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { useCase, useCaseText } from "@/hooks/useCase";
import { useNow } from "@/hooks/useNow";
import { useTx } from "@/hooks/useTx";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { REFUND_REASON, SPEED, sameAddress, statusName, timeLeft, ZERO_ADDRESS, type ChainCase } from "@/lib/cases";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { inviteLink, loadInviteKey } from "@/lib/inviteStore";
import { network } from "@/lib/network";
import { wagmiConfig } from "@/lib/wagmi";
import { VotePanel } from "./VotePanel";

export function CaseView() {
  const { id } = useParams<{ id: string }>();
  const caseId = /^\d+$/.test(id) ? BigInt(id) : null;
  const { address } = useAccount();
  const now = useNow();
  const { c, jurors, myVote, randomnessReady, isLoading, refetch } = useCase(caseId);
  const text = useCaseText(caseId);

  if (!caseId) return <Page><Title>Case not found</Title></Page>;
  if (isLoading || !c) return <Page><Hint>Loading case…</Hint></Page>;
  if (c.status === 0) return <Page><Title>Case not found</Title></Page>;

  const status = statusName(c);
  const isA = sameAddress(address, c.partyA);
  const isB = sameAddress(address, c.partyB);
  const isJuror = Boolean(myVote && myVote.root !== ZERO_ADDRESS);
  const t = text.data;
  const sideText = (s: string | null | undefined, who: "A" | "B") =>
    s ?? (
      <span className="text-ink/50">
        {who === "B" && c.partyB === ZERO_ADDRESS
          ? "Waiting for the other person to write their side."
          : t?.removalRequested || t?.hidden
            ? "Removed from public view."
            : "Only the two people in this case and its jury can read this."}
      </span>
    );
  const winner = c.status === 5 ? (c.verdict === 1 ? "A" : "B") : null;

  return (
    <Page>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          <span className="text-sm font-semibold text-ink/60">
            Case #{caseId.toString()} · {c.speed === SPEED.Fast ? "Fast" : "Standard"} · {formatG(c.fee)}{" "}
            {network.tokenSymbol} each
          </span>
        </div>
        <Title>{isA || isB ? "Your case" : isJuror ? "You're on this jury" : "The case"}</Title>
      </div>

      {winner && <Verdict c={c} winner={winner} isA={isA} isB={isB} />}
      {c.status === 6 && (
        <Panel>
          <p className="font-display text-xl font-extrabold">No verdict. Both sides refunded.</p>
          <p>{REFUND_REASON[c.refundReason]}</p>
          {(isA || isB) && (
            <Link className="btn self-start" href="/account">Withdraw your refund</Link>
          )}
        </Panel>
      )}

      <div className="grid gap-4">
        <SideCard side="A" label={isA ? "Your side" : "Side A"} text={sideText(t?.sideA, "A")} highlight={winner === "A"} />
        <SideCard side="B" label={isB ? "Your side" : "Side B"} text={sideText(t?.sideB, "B")} highlight={winner === "B"} />
      </div>

      {isJuror && c.status === 4 && caseId && <VotePanel caseId={caseId} c={c} jurors={jurors} myVote={myVote!} onDone={refetch} />}

      <StagePanel caseId={caseId} c={c} jurors={jurors} randomnessReady={randomnessReady} isA={isA} now={now} onDone={refetch} />

      {(isA || isB) && t && <PrivacyControls caseId={caseId} isPublic={t.isPublic} removalRequested={t.removalRequested} />}
      <ReportCase caseId={caseId} />
    </Page>
  );
}

function Verdict({ c, winner, isA, isB }: { c: ChainCase; winner: "A" | "B"; isA: boolean; isB: boolean }) {
  const mine = (winner === "A" && isA) || (winner === "B" && isB);
  const headline = isA || isB ? (mine ? "You were right!" : "The jury sided with them.") : `Side ${winner} is right.`;
  return (
    <section className="tile overflow-hidden bg-court text-white">
      <div className="flex items-center gap-4 p-5">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink font-display text-3xl font-extrabold ${winner === "A" ? "bg-side-a" : "bg-side-b"}`}>
          {winner}
        </div>
        <div>
          <p className="font-display text-2xl font-extrabold leading-tight">{headline}</p>
          <p className="text-white/80">
            The jury voted {c.votesA}–{c.votesB}. {formatG(c.depositA + c.depositB)} {network.tokenSymbol} went to the {c.reveals} jurors who voted.
          </p>
        </div>
      </div>
      <p className="border-t-2 border-white/15 bg-court-deep px-5 py-2 text-sm text-white/80">Random jury · decided on-chain</p>
    </section>
  );
}

function StagePanel(props: {
  caseId: bigint;
  c: ChainCase;
  jurors: readonly string[];
  randomnessReady: boolean;
  isA: boolean;
  now: number;
  onDone: () => void;
}) {
  const { caseId, c, jurors, randomnessReady, isA, now, onDone } = props;
  const sendTx = useTx();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const wr = network.whosRight!;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(undefined);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(undefined);
    }
  }
  const call = (fn: "cancelExpired" | "drawJury" | "finalize") => () =>
    sendTx({ address: wr, abi: whosRightAbi, functionName: fn, args: [caseId] });
  const requestJury = async () => {
    const gasPrice = await getGasPrice(wagmiConfig, { chainId: network.chain.id });
    const fee = await readContract(wagmiConfig, { address: wr, abi: whosRightAbi, functionName: "randomnessFee", args: [gasPrice] });
    await sendTx({ address: wr, abi: whosRightAbi, functionName: "requestJury", args: [caseId], value: fee === 0n ? 0n : (fee * 12n) / 10n });
  };
  const btn = (label: string, onClick: () => Promise<unknown>) => (
    <button className="btn self-start" disabled={Boolean(busy)} onClick={() => run(label, onClick)}>
      {busy === label ? "Working…" : label}
    </button>
  );
  const keeperNote = <Hint>Anyone can press this. Soon it will happen automatically.</Hint>;

  let body: React.ReactNode = null;
  if (c.status === 1) {
    const expired = now > Number(c.joinDeadline);
    body = expired ? (
      <>
        <p className="font-semibold">The other person didn&apos;t join in time.</p>
        {btn("Cancel and refund", call("cancelExpired"))}
      </>
    ) : isA ? (
      <InviteShare caseId={caseId} deadline={timeLeft(c.joinDeadline, now)} />
    ) : (
      <p>Waiting for the other person to join ({timeLeft(c.joinDeadline, now)} left).</p>
    );
  } else if (c.status === 2) {
    body =
      now > Number(c.drawDeadline) ? (
        <><p className="font-semibold">The jury wasn&apos;t called in time.</p>{btn("Cancel and refund", call("cancelExpired"))}</>
      ) : (
        <><p className="font-semibold">Both sides are in. Time to call the jury.</p>{btn("Call the jury", requestJury)}{keeperNote}</>
      );
  } else if (c.status === 3) {
    body =
      now > Number(c.drawDeadline) ? (
        <><p className="font-semibold">The jury couldn&apos;t be drawn in time.</p>{btn("Cancel and refund", call("cancelExpired"))}</>
      ) : randomnessReady ? (
        <><p className="font-semibold">The dice are rolled. Draw the jury!</p>{btn("Draw the jury", call("drawJury"))}{keeperNote}</>
      ) : (
        <p>Rolling the dice for a fair, random jury… ({timeLeft(c.drawDeadline, now)} left)</p>
      );
  } else if (c.status === 4) {
    const revealOpen = now > Number(c.commitDeadline) || c.commits === jurors.length;
    const canFinalize = now > Number(c.revealDeadline) || (revealOpen && c.reveals === c.commits);
    body = (
      <>
        <JuryMeter total={jurors.length} locked={c.commits} revealed={c.reveals} />
        <p>
          {!revealOpen
            ? `Jurors are locking in secret votes (${timeLeft(c.commitDeadline, now)} left).`
            : canFinalize
              ? "Voting is over."
              : `Jurors are revealing their votes (${timeLeft(c.revealDeadline, now)} left).`}
        </p>
        {canFinalize && <>{btn("Announce the verdict", call("finalize"))}{keeperNote}</>}
      </>
    );
  }
  if (!body) return null;
  return (
    <Panel>
      {body}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}

function JuryMeter({ total, locked, revealed }: { total: number; locked: number; revealed: number }) {
  return (
    <div className="flex gap-2" aria-label={`${locked} of ${total} votes locked, ${revealed} revealed`}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`flex h-12 flex-1 items-center justify-center rounded-xl border-[3px] border-ink font-display font-extrabold ${
            i < revealed ? "bg-side-b text-white" : i < locked ? "bg-verdict" : "bg-white text-ink/30"
          }`}
        >
          {i < revealed ? "✓" : i < locked ? "🔒" : "?"}
        </div>
      ))}
    </div>
  );
}

function InviteShare({ caseId, deadline }: { caseId: bigint; deadline: string }) {
  const params = useSearchParams();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const pk = loadInviteKey(caseId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after mount
    setLink(pk ? inviteLink(window.location.origin, caseId, pk) : null);
  }, [caseId]);

  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-xl font-extrabold">{params.get("new") ? "Case open! Now call them out." : "Invite the other person"}</p>
      {link ? (
        <>
          <p className="rounded-xl bg-side-a/10 p-3 text-sm">
            <strong>Send this link privately</strong>, only to the other person. Anyone with it can take their seat.
            They have {deadline} to join.
          </p>
          <code className="break-all rounded-lg bg-ink/5 px-2 py-1 text-xs">{link}</code>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              onClick={async () => {
                if (navigator.share) await navigator.share({ title: "Who's Right?", text: "Let's settle this. Tell your side:", url: link }).catch(() => {});
                else {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }
              }}
            >
              Share invite
            </button>
            <button className="btn-secondary" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm">
          The invite link was made on the device you opened the case with. Open this page there to share it.
        </p>
      )}
    </div>
  );
}

function PrivacyControls({ caseId, isPublic, removalRequested }: { caseId: bigint; isPublic: boolean; removalRequested: boolean }) {
  const authFetch = useAuthFetch();
  const [done, setDone] = useState(removalRequested);
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-ink/70">
        {done
          ? "This case is off public view."
          : isPublic
            ? "Both sides agreed, so this case can be shown publicly."
            : "This case is shown publicly only after both sides agree."}
      </p>
      {!done && (
        <button
          className="btn-secondary self-start"
          onClick={async () => {
            try {
              await authFetch(`/api/cases/${caseId}/removal`, { method: "POST" });
              setDone(true);
            } catch (e) {
              setError(friendlyError(e));
            }
          }}
        >
          Remove from public view
        </button>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

function ReportCase({ caseId }: { caseId: bigint }) {
  const authFetch = useAuthFetch();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sent">("idle");
  const [error, setError] = useState<string>();
  if (state === "sent") return <Hint>Thanks. We&apos;ll review this case.</Hint>;
  if (!open) return <button className="self-start text-sm text-ink/60 underline" onClick={() => setOpen(true)}>Report this case</button>;
  return (
    <div className="flex flex-col gap-2">
      <textarea className="tile p-3 text-sm" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong with this case?" />
      <button
        className="btn-secondary self-start"
        onClick={async () => {
          try {
            await authFetch(`/api/cases/${caseId}/report`, { method: "POST", body: JSON.stringify({ reason }) });
            setState("sent");
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      >
        Send report
      </button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
