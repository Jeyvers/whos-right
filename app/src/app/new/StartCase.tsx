"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEventLogs, zeroAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useReadContracts } from "wagmi";
import { Gate } from "@/components/Gate";
import { PayButton } from "@/components/PayButton";
import { CaseFileEditor, RuleChips, Segmented, Step } from "@/components/CaseComposer";
import { ErrorNote, Page, Title } from "@/components/ui";
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

  const sym = network.tokenSymbol;
  return (
    <div className="flex flex-col gap-8 pb-28 sm:pb-0">
      {paused && <ErrorNote>New cases are paused right now.</ErrorNote>}

      <Step n={1} title="How do you want to settle it?">
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: MODE.OneSided, title: "Ask the jury", meta: "Just your side" },
            { value: MODE.TwoSided, title: "Settle it together", meta: "They tell theirs too" },
          ]}
        />
        <p className="text-sm text-ink/70">
          {oneSided
            ? "The jury reads your side and says whether you're right or wrong."
            : "You'll get a private invite link. The other person writes their side and pays the same."}
        </p>
      </Step>

      <Step n={2} title="Your case">
        <CaseFileEditor
          title={title}
          onTitle={setTitle}
          text={text}
          onText={setText}
          attempted={attempted}
          strict={oneSided}
        />
        <RuleChips strict={oneSided} />
        <p className="text-xs text-ink/50">Just a quick A vs B? This or That is coming soon.</p>
      </Step>

      <Step n={3} title="How fast?">
        <Segmented
          label="Speed"
          value={speed}
          onChange={setSpeed}
          options={[
            {
              value: SPEED.Standard,
              title: <>Standard · {standardFee !== undefined ? formatG(standardFee) : "…"} {sym}</>,
              meta: "Verdict within 12 hours",
            },
            {
              value: SPEED.Fast,
              title: <>⚡ Fast · {fastFee !== undefined ? formatG(fastFee) : "…"} {sym}</>,
              meta: "Verdict within 2 hours",
            },
          ]}
        />
        <p className="text-sm text-ink/70">
          {oneSided
            ? "Only you pay. If no verdict is reached, you get it back."
            : "The other person pays the same. If no verdict is reached, you both get it back."}
        </p>
      </Step>

      {/* Pinned to the bottom on phones so the button is always one tap away. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-white p-3 shadow-[0_-4px_0_0_rgba(27,16,53,0.08)] sm:static sm:z-auto sm:rounded-3xl sm:border-[3px] sm:p-5 sm:shadow-[0_6px_0_0_var(--color-ink)]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
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
        </div>
      </div>
    </div>
  );
}
