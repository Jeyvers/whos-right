"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useAccount } from "wagmi";
import { readContract } from "wagmi/actions";
import { Gate } from "@/components/Gate";
import { PayButton } from "@/components/PayButton";
import { SideEditor } from "@/components/SideEditor";
import { ErrorNote, Page, Panel, SideCard, Title } from "@/components/ui";
import { useAuthFetch } from "@/hooks/useAuthFetch";
import { useCase, useCaseText } from "@/hooks/useCase";
import { useNow } from "@/hooks/useNow";
import { usePayFee } from "@/hooks/usePayFee";
import { useTx } from "@/hooks/useTx";
import { whosRightAbi } from "@/lib/abi/whosRight";
import { SPEED, sameAddress, timeLeft, type ChainCase } from "@/lib/cases";
import { friendlyError } from "@/lib/errors";
import { formatG } from "@/lib/format";
import { inviteViewMessage } from "@/lib/inviteView";
import { network } from "@/lib/network";
import { checkSideText } from "@/lib/textRules";
import { wagmiConfig } from "@/lib/wagmi";
import { Loading } from "@/components/Loading";

/** Reads the invite key from the link's #k=... (never sent to our server). */
function useInviteKey(): Hex | null | undefined {
  const [pk, setPk] = useState<Hex | null>();
  useEffect(() => {
    const k = new URLSearchParams(window.location.hash.slice(1)).get("k");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL fragment is only readable after mount
    setPk(k && isHex(k) && k.length === 66 ? k : null);
  }, []);
  return pk;
}

export function JoinCase() {
  const { id } = useParams<{ id: string }>();
  const caseId = /^\d+$/.test(id) ? BigInt(id) : null;
  const pk = useInviteKey();
  const now = useNow();
  const { c, isLoading } = useCase(caseId);
  const [previewSig, setPreviewSig] = useState<string>();
  useEffect(() => {
    if (!pk || !caseId) return;
    privateKeyToAccount(pk).signMessage({ message: inviteViewMessage(network.name, caseId) }).then(setPreviewSig);
  }, [pk, caseId]);
  const text = useCaseText(caseId, { inviteSig: previewSig, enabled: Boolean(previewSig) });

  if (pk === undefined || isLoading) return <Page><Loading label="Opening your invite…" /></Page>;
  if (!caseId || !pk || !c || c.status === 0) {
    return <Page><Title sub="Ask the person who invited you to send the full link again.">This invite link is broken</Title></Page>;
  }
  if (sameAddress(privateKeyToAccount(pk).address, c.inviteSigner) === false) {
    return <Page><Title sub="Ask for a fresh link.">This invite isn&apos;t for this case</Title></Page>;
  }
  if (c.status !== 1) {
    return (
      <Page>
        <Title sub="Someone already joined, or the case moved on.">This invite has been used</Title>
        <a className="btn self-start" href={`/c/${caseId}`}>See the case</a>
      </Page>
    );
  }
  if (now > Number(c.joinDeadline)) {
    return <Page><Title sub="The time to join has run out. The other person gets a refund.">This invite expired</Title></Page>;
  }

  return (
    <Page>
      <Title sub="Someone thinks they're right. Read their side, then tell yours.">You&apos;ve been called out!</Title>
      <SideCard side="A" label="Their side" text={text.data?.sideA ?? <Loading size="sm" label="Loading their side…" />} />
      <Terms c={c} deadline={timeLeft(c.joinDeadline, now)} />
      <Gate>
        <JoinForm caseId={caseId} c={c} pk={pk} />
      </Gate>
    </Page>
  );
}

function Terms({ c, deadline }: { c: ChainCase; deadline: string }) {
  const fast = c.speed === SPEED.Fast;
  return (
    <Panel tone="court">
      <p className="font-display text-xl font-extrabold">The terms</p>
      <ul className="flex flex-col gap-1">
        <li><strong>{fast ? "Fast" : "Standard"}</strong>: verdict within {fast ? "2" : "12"} hours of the jury being drawn.</li>
        <li><strong>Random jury</strong> of verified people, paid from the fees.</li>
        <li>You pay <strong>{formatG(c.fee)} {network.tokenSymbol}</strong>, the same as them. Refunded if there&apos;s no verdict.</li>
        <li>You have <strong>{deadline}</strong> to join.</li>
      </ul>
    </Panel>
  );
}

function JoinForm({ caseId, c, pk }: { caseId: bigint; c: ChainCase; pk: Hex }) {
  const router = useRouter();
  const { address } = useAccount();
  const authFetch = useAuthFetch();
  const sendTx = useTx();
  const { pay, plan, step, error, begin, fail, me } = usePayFee();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<{ text: string; sideId: string; contentHash: Hex }>();
  const [attempted, setAttempted] = useState(false);
  const wr = network.whosRight!;

  if (sameAddress(address, c.partyA)) {
    return <Panel><p className="font-semibold">This is your own case. Send the link to the other person.</p></Panel>;
  }

  async function submit() {
    if (checkSideText(text).errors.length > 0) {
      setAttempted(true);
      return;
    }
    begin(); // the button shows its spinner right away
    try {
      const side =
        saved && saved.text === text.trim()
          ? saved
          : {
              text: text.trim(),
              ...(await authFetch<{ sideId: string; contentHash: Hex }>("/api/sides", {
                method: "POST",
                body: JSON.stringify({ text }),
              })),
            };
      setSaved(side);
      await pay(c.fee, async () => {
        const digest = await readContract(wagmiConfig, {
          address: wr,
          abi: whosRightAbi,
          functionName: "joinDigest",
          args: [caseId, address!],
        });
        // joinDigest is already the EIP-191 hash; sign it raw with the invite key.
        const signature = await privateKeyToAccount(pk).sign({ hash: digest });
        await sendTx({
          address: wr,
          abi: whosRightAbi,
          functionName: "joinCase",
          args: [caseId, side.contentHash, c.speed, c.fee, signature],
        });
        await authFetch(`/api/cases/${caseId}/link`, { method: "POST", body: JSON.stringify({ sideId: side.sideId }) });
        router.push(`/c/${caseId}`);
      }, "joinCase");
    } catch (e) {
      fail(friendlyError(e));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SideEditor label="Your side of the story" value={text} onChange={setText} attempted={attempted} />
      <Panel>
        <PayButton
          fee={c.fee}
          balance={me.gBalance}
          plan={plan(c.fee, "Join the case")}
          step={step}
          disabled={false}
          label="Pay and join"
          onPay={submit}
        />
        <ErrorNote>{error}</ErrorNote>
      </Panel>
    </div>
  );
}
