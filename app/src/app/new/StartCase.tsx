"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEventLogs, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useReadContracts } from "wagmi";
import { Gate } from "@/components/Gate";
import { PayButton } from "@/components/PayButton";
import { PublicConsent, SideEditor } from "@/components/SideEditor";
import { ErrorNote, Page, Panel, Title } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { usePayFee } from "@/hooks/usePayFee";
import { useTx } from "@/hooks/useTx";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { SPEED, type SpeedValue } from "@/lib/cases";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { saveInviteKey } from "@/lib/inviteStore";
import { network } from "@/lib/network";
import { checkSideText } from "@/lib/textRules";

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
  const { pay, step, error, setError, shortfall, needsClaim, me } = usePayFee();
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState<SpeedValue>(SPEED.Standard);
  const [agree, setAgree] = useState(false);
  const [saved, setSaved] = useState<{ text: string; sideId: string; contentHash: Hex }>();
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
  const textOk = checkSideText(text).errors.length === 0;

  async function submit() {
    if (fee === undefined) return;
    if (!textOk || !agree) {
      setAttempted(true);
      return;
    }
    setError(undefined);
    try {
      // 1. Save the text off-chain; get the salted hash that goes on-chain. Reuse it if unchanged.
      const side =
        saved && saved.text === text.trim()
          ? saved
          : {
              text: text.trim(),
              ...(await authFetch<{ sideId: string; contentHash: Hex }>("/api/sides", {
                method: "POST",
                body: JSON.stringify({ text, publicConsent: agree }),
              })),
            };
      setSaved(side);

      // 2. One-time invite key, made here in the browser. Its private key only ever goes in the share link.
      const invitePk = generatePrivateKey();
      const inviteSigner = privateKeyToAccount(invitePk).address;

      // 3. Claim if needed -> approve -> open the case.
      await pay(fee, async () => {
        const receipt = await sendTx({
          address: wr,
          abi: whosRightAbi,
          functionName: "openCase",
          args: [speed, side.contentHash, inviteSigner],
        });
        const [opened] = parseEventLogs({ abi: whosRightAbi, eventName: "CaseOpened", logs: receipt.logs });
        const caseId = opened.args.caseId;
        saveInviteKey(caseId, invitePk);
        await authFetch(`/api/cases/${caseId}/link`, { method: "POST", body: JSON.stringify({ sideId: side.sideId }) });
        router.push(`/c/${caseId}?new=1`);
      });
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {paused && <ErrorNote>New cases are paused right now.</ErrorNote>}
      <SideEditor
        label="Your side of the story"
        value={text}
        onChange={setText}
        attempted={attempted}
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
        <p className="text-sm text-ink/65">The other person pays the same. If no verdict is reached, you both get it back.</p>
      </div>

      <PublicConsent checked={agree} onChange={setAgree} attempted={attempted} />

      <Panel>
        <PayButton
          fee={fee}
          balance={me.gBalance}
          shortfall={fee !== undefined ? shortfall(fee) : 0n}
          needsClaim={fee !== undefined && needsClaim(fee)}
          step={step}
          disabled={Boolean(paused)}
          label="Pay and open case"
          onPay={submit}
        />
        <ErrorNote>{error}</ErrorNote>
      </Panel>
    </div>
  );
}
