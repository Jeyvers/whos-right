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
import { KeeperBanner } from "@/components/KeeperBanner";
import { useKeeperPoke, useKeeperStatus } from "@/hooks/useKeeper";
import { VotePanel } from "./VotePanel";
import { CrowdBar } from "@/components/CaseCard";
import { useCrowdVote } from "@/hooks/useCrowdVote";
import { calledIt } from "@/lib/crowd";
import { Loading } from "@/components/Loading";
import { Spinner } from "@/components/Loading";

export function CaseView() {
  const { id } = useParams<{ id: string }>();
  const caseId = /^\d+$/.test(id) ? BigInt(id) : null;
  const { address } = useAccount();
  const now = useNow();
  const { c, jurors, myVote, randomnessReady, isLoading, refetch } = useCase(caseId);
  const text = useCaseText(caseId);
  const waitingOnKeeper = Boolean(
    c && (c.status === 2 || c.status === 3 || c.status === 4 || (c.status === 1 && now > Number(c.joinDeadline))),
  );
  useKeeperPoke(waitingOnKeeper);

  if (!caseId) return <Page><Title>Case not found</Title></Page>;
  if (isLoading || !c) return <Page><Loading label="Opening the case…" /></Page>;
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
  const oneSided = c.mode === 1;

  return (
    <Page>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          <span className="text-sm font-semibold text-ink/60">
            Case #{caseId.toString()} · {c.speed === SPEED.Fast ? "Fast" : "Standard"} · {formatG(c.fee)}{" "}
            {network.tokenSymbol}{oneSided ? "" : " each"}
          </span>
        </div>
        <p className="text-sm font-bold text-ink/60">
          {isA || isB ? "Your case" : isJuror ? "You're on this jury" : oneSided ? "Only one side of the story" : "The case"}
        </p>
        <Title>{t?.title ?? (oneSided ? "Are they right?" : "Who's right?")}</Title>
      </div>

      {winner && <Verdict c={c} winner={winner} isA={isA} isB={isB} oneSided={oneSided} />}
      {c.status === 6 && (
        <section id="verdict" className="scroll-mt-4">
        <Panel>
          <p className="font-display text-xl font-extrabold">{oneSided ? "No verdict. The fee was refunded." : "No verdict. Both sides refunded."}</p>
          <p>{REFUND_REASON[c.refundReason]}</p>
          {(isA || isB) && (
            <Link className="btn self-start" href="/account">Withdraw your refund</Link>
          )}
        </Panel>
        </section>
      )}

      {oneSided ? (
        <div className="grid gap-2">
          {!isA && <p className="self-start rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">Only one side of the story</p>}
          <SideCard side="A" label={isA ? "Your side" : "Their side"} text={sideText(t?.sideA, "A")} />
        </div>
      ) : (
        <div className="grid gap-4">
          <SideCard side="A" label={isA ? "Your side" : isB ? "Their side" : "First side"} text={sideText(t?.sideA, "A")} highlight={winner === "A"} />
          <SideCard side="B" label={isB ? "Your side" : "Their side"} text={sideText(t?.sideB, "B")} highlight={winner === "B"} />
        </div>
      )}

      {!isA && !isB && !isJuror && t && t.access !== "invite" && c.status >= 2 && (
        <CrowdSection caseId={caseId} c={c} myVote={t.myCrowdVote} crowd={t.crowd} total={t.crowdTotal} />
      )}

      {isJuror && c.status === 4 && caseId && <VotePanel caseId={caseId} c={c} jurors={jurors} myVote={myVote!} onDone={refetch} />}

      {waitingOnKeeper && <KeeperBanner />}
      <StagePanel caseId={caseId} c={c} jurors={jurors} randomnessReady={randomnessReady} isA={isA} now={now} onDone={refetch} />

      {(isA || isB) && t && <PrivacyControls caseId={caseId} isPublic={t.isPublic} removalRequested={t.removalRequested} />}
      <ReportCase caseId={caseId} />
    </Page>
  );
}

function Verdict(props: { c: ChainCase; winner: "A" | "B"; isA: boolean; isB: boolean; oneSided: boolean }) {
  const { c, winner, isA, isB, oneSided } = props;
  const mine = (winner === "A" && isA) || (winner === "B" && isB);
  const right = winner === "A";
  const headline = oneSided
    ? isA
      ? right ? "You're right!" : "You're wrong."
      : `The jury says: ${right ? "Right" : "Wrong"}.`
    : isA || isB
      ? mine ? "You were right!" : "The jury sided with them."
      : `${winner === "A" ? "The first side" : "Their side"} is right.`;
  return (
    <section id="verdict" className="tile scroll-mt-4 overflow-hidden bg-court text-white">
      <div className="flex items-center gap-4 p-5">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink font-display text-3xl font-extrabold ${winner === "A" ? "bg-side-a" : "bg-side-b"}`}>
          {oneSided ? (right ? "✓" : "✗") : winner === "A" ? "1" : "2"}
        </div>
        <div>
          <p className="font-display text-2xl font-extrabold leading-tight">{headline}</p>
          <p className="text-white/80">
            The jury voted {oneSided ? `${c.votesA} right, ${c.votesB} wrong` : `${c.votesA}–${c.votesB}`}. {formatG(c.depositA + c.depositB)} {network.tokenSymbol} went to the {c.reveals} jurors who voted.
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
  onDone: () => Promise<{ data?: readonly unknown[] }>;
}) {
  const { caseId, c, jurors, randomnessReady, isA, now, onDone } = props;
  const sendTx = useTx();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const wr = network.whosRight!;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(undefined);
    setNote(undefined);
    const before = c.status;
    try {
      await fn();
      void onDone();
    } catch (e) {
      // Often a race: the keeper (or someone else) did this step a moment earlier. Re-check before calling it an error.
      const fresh = (await onDone().catch(() => undefined))?.data?.[0] as ChainCase | undefined;
      if (fresh && fresh.status !== before) setNote("Already done: this step happened automatically a moment ago.");
      else setError(friendlyError(e));
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
      {busy === label ? <><Spinner /> Working…</> : label}
    </button>
  );
  const keeper = useKeeperStatus().data;
  const auto = keeper?.configured && keeper.healthy && !keeper.capped;
  const keeperNote = (
    <Hint>{auto ? "This happens automatically within a minute. You can also press it now." : "Anyone can press this."}</Hint>
  );

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
        <><p className="font-semibold">{c.mode === 1 ? "Ready for the jury." : "Both sides are in. Time to call the jury."}</p>{btn("Call the jury", requestJury)}{keeperNote}</>
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
      {note && <Hint>{note}</Hint>}
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

/** Crowd vote for anyone who isn't a party or a drawn juror. Results appear with the official verdict. */
function CrowdSection(props: { caseId: bigint; c: ChainCase; myVote: number | null; crowd: { a: number; b: number } | null; total: number }) {
  const { caseId, c, crowd, total } = props;
  const { myVote, cast, busy, error } = useCrowdVote(caseId.toString(), props.myVote);
  const oneSided = c.mode === 1;
  const decided = c.status === 5 || c.status === 6;
  const called = calledIt(myVote, c.status, c.verdict);
  return (
    <Panel>
      <p className="font-display text-xl font-extrabold">
        {decided ? "What the crowd said" : oneSided ? "Are they right?" : "Who do you think is right?"}
      </p>
      {!decided && !myVote && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button className={`btn text-white ${oneSided ? "bg-side-b" : "bg-side-a"}`} disabled={busy} onClick={() => cast(1)}>
              {busy ? <Spinner /> : oneSided ? "Right" : "First side"}
            </button>
            <button className={`btn text-white ${oneSided ? "bg-side-a" : "bg-side-b"}`} disabled={busy} onClick={() => cast(2)}>
              {busy ? <Spinner /> : oneSided ? "Wrong" : "Their side"}
            </button>
          </div>
          <Hint>The random jury gives the official verdict. See if you call it.</Hint>
        </>
      )}
      {!decided && myVote && (
        <p>
          <strong>You said: {oneSided ? (myVote === 1 ? "Right" : "Wrong") : myVote === 1 ? "first side" : "their side"}.</strong> Crowd results show once the jury decides
          {total > 1 ? ` · ${total} people have weighed in` : ""}.
        </p>
      )}
      {decided && (
        <>
          {called !== null && (
            <p className={`self-start rounded-full px-3 py-1 font-extrabold ${called ? "bg-verdict" : "bg-ink/10"}`}>
              {called ? "You called it ✓" : "The jury disagreed with you ✗"}
            </p>
          )}
          {crowd ? <CrowdBar a={crowd.a} b={crowd.b} labels={oneSided ? ["Right", "Wrong"] : ["First", "Theirs"]} /> : <Hint>No crowd votes on this one.</Hint>}
        </>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Panel>
  );
}
