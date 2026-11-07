"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEventLogs, zeroAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useReadContracts } from "wagmi";
import { Gate } from "@/components/Gate";
import { PayButton } from "@/components/PayButton";
import { SideEditor, TitleField } from "@/components/SideEditor";
import { ErrorNote, Page, Panel, Title } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { usePayFee } from "@/hooks/usePayFee";
import { useTx } from "@/hooks/useTx";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { MODE, SPEED, type ModeValue, type SpeedValue } from "@/lib/cases";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { saveInviteKey } from "@/lib/inviteStore";
import { network } from "@/lib/network";
import { checkSideText, checkTitle } from "@/lib/textRules";

export function StartCase() {
  return (
    <Page>
      <Title sub="Write your side, pick a speed, then send the invite to the other person.">Start a case</Title>
      <Gate>
        <StartCaseForm />
      </Gate>
    </Page>
  );
}

function StartCaseForm() {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const sendTx = useTx();
  const { pay, plan, step, error, begin, fail, me } = usePayFee();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ModeValue>(MODE.OneSided); // "Ask the jury" is the default
  const [speed, setSpeed] = useState<SpeedValue>(SPEED.Standard);
  const [saved, setSaved] = useState<{ key: string; sideId: string; contentHash: Hex }>();
  const oneSided = mode === MODE.OneSided;
  const [attempted, setAttempted] = useState(false);

  const wr = network.whosRight!;
  const fees = useReadContracts({
    contracts: [
      { address: wr, abi: whosRightAbi, functionName: "speedFee", args: [SPEED.Standard] },
      { address: wr, abi: whosRightAbi, functionName: "speedFee", args: [SPEED.Fast] },
      { address: wr, abi: whosRightAbi, functionName: "newCasesPaused" },
    ],
    allowFailure: false,
  });
  const [standardFee, fastFee, paused] = fees.data ?? [];
  const fee = speed === SPEED.Fast ? fastFee : standardFee;
  const textOk =
    checkSideText(text, { strict: oneSided }).errors.length === 0 && checkTitle(title, { strict: oneSided }).errors.length === 0;

  async function submit() {
    if (fee === undefined) return;
    if (!textOk) {
      setAttempted(true);
      return;
    }
    begin(); // the button shows its spinner right away
    try {
      // 1. Save the title + text off-chain; get the salted hash that goes on-chain. Reuse it if unchanged.
      const key = `${mode}|${title.trim()}|${text.trim()}`;
      const side =
        saved && saved.key === key
          ? saved
          : {
              key,
              ...(await authFetch<{ sideId: string; contentHash: Hex }>("/api/sides", {
                method: "POST",
                body: JSON.stringify({ title, text, strict: oneSided }),
              })),
            };
      setSaved(side);

      // 2. Two-sided only: a one-time invite key made here in the browser; its private key only goes in the link.
      const invitePk = oneSided ? null : generatePrivateKey();
      const inviteSigner = invitePk ? privateKeyToAccount(invitePk).address : zeroAddress;

      // 3. Claim if needed -> approve -> open the case.
      await pay(fee, async () => {
        const receipt = await sendTx({
          address: wr,
          abi: whosRightAbi,
          functionName: "openCase",
          args: [speed, mode, side.contentHash, inviteSigner],
        });
        const [opened] = parseEventLogs({ abi: whosRightAbi, eventName: "CaseOpened", logs: receipt.logs });
        const caseId = opened.args.caseId;
        if (invitePk) saveInviteKey(caseId, invitePk);
        await authFetch(`/api/cases/${caseId}/link`, { method: "POST", body: JSON.stringify({ sideId: side.sideId }) });
        router.push(`/c/${caseId}?new=1`);
      }, "openCase");
    } catch (e) {
      fail(friendlyError(e));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {paused && <ErrorNote>New cases are paused right now.</ErrorNote>}

      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-bold">How do you want to settle it?</p>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {[
            { v: MODE.OneSided, name: "Ask the jury", sub: "Just your side. The jury says if you're right or wrong." },
            { v: MODE.TwoSided, name: "Settle it together", sub: "Invite the other person. They tell their side too." },
          ].map((o) => (
            <button
              key={o.name}
              role="radio"
              aria-checked={mode === o.v}
              onClick={() => setMode(o.v)}
              className={`tile p-4 text-left transition-transform ${mode === o.v ? "-translate-y-1 bg-verdict" : "bg-white opacity-80"}`}
            >
              <p className="font-display text-xl font-extrabold">{o.name}</p>
              <p className="text-sm text-ink/70">{o.sub}</p>
            </button>
          ))}
        </div>
        {oneSided && (
          <p className="rounded-xl bg-lilac p-3 text-sm">
            The other person can&apos;t reply, so stricter privacy rules apply: no names or @handles at all.
          </p>
        )}
      </div>

      <TitleField value={title} onChange={setTitle} attempted={attempted} strict={oneSided} />
      <SideEditor
        label="Your side of the story"
        value={text}
        onChange={setText}
        attempted={attempted}
        strict={oneSided}
        footnote="Just a quick A vs B? This or That is coming soon."
      />

      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-bold">How fast?</p>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {[
            { v: SPEED.Standard, name: "Standard", sub: "Verdict within 12 hours", f: standardFee },
            { v: SPEED.Fast, name: "Fast", sub: "Verdict within 2 hours", f: fastFee },
          ].map((o) => (
            <button
              key={o.name}
              role="radio"
              aria-checked={speed === o.v}
              onClick={() => setSpeed(o.v)}
              className={`tile p-4 text-left transition-transform ${speed === o.v ? "-translate-y-1 bg-verdict" : "bg-white opacity-80"}`}
            >
              <p className="font-display text-xl font-extrabold">{o.name}</p>
              <p className="text-sm text-ink/70">{o.sub}</p>
              <p className="mt-1 font-display text-2xl font-extrabold">
                {o.f !== undefined ? formatG(o.f) : "…"} <span className="text-sm">{network.tokenSymbol}</span>
              </p>
            </button>
          ))}
        </div>
        <p className="text-sm text-ink/65">
          {oneSided
            ? "Only you pay. If no verdict is reached, you get it back."
            : "The other person pays the same. If no verdict is reached, you both get it back."}
        </p>
      </div>


      <Panel>
        <PayButton
          fee={fee}
          balance={me.gBalance}
          plan={fee !== undefined ? plan(fee, oneSided ? "Send it to the jury" : "Open your case") : undefined}
          step={step}
          disabled={Boolean(paused)}
          label={oneSided ? "Pay and ask the jury" : "Pay and open case"}
          onPay={submit}
        />
        <ErrorNote>{error}</ErrorNote>
      </Panel>
    </div>
  );
}
