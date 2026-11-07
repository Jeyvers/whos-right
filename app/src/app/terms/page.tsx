import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Terms · Who's Right?" };

export default function Terms() {
  return (
    <Prose>
      <h1>Terms</h1>
      <p className="text-sm text-zinc-600">Draft, last updated 7 November 2026.</p>

      <h2>Who can use this</h2>
      <p>You must be 18 or older. You must be a real person verified through GoodDollar to open, join or judge a case.</p>

      <h2>What the service does</h2>
      <p>
        Two people each pay the same fee in G$ and a randomly drawn jury of verified people votes on who is right. The
        whole fee pot goes to the jurors who vote on time. The person who wins gets no money. If no verdict is reached,
        both people are refunded. Verdicts are opinions of the jurors, not legal, medical or financial advice, and have
        no legal effect.
      </p>

      <h2>Payments</h2>
      <ul>
        <li>Fees are paid in G$ on the Celo blockchain and are handled by a public smart contract, not by us.</li>
        <li>Blockchain transactions can&apos;t be reversed. Refunds happen only in the cases the contract allows.</li>
        <li>You are responsible for your wallet and anything you sign with it.</li>
      </ul>

      <h2>What you may post</h2>
      <ul>
        <li>Text only. Describe people by role (&quot;my roommate&quot;), not by name.</li>
        <li>No phone numbers, emails, addresses, links or anything that identifies a private person.</li>
        <li>No harassment, hate, threats, sexual content involving minors, or illegal content.</li>
      </ul>
      <p>We may hide any case that breaks these rules. Hiding removes it from the app; it can&apos;t undo payments.</p>

      <h2>Public cases</h2>
      <p>
        A case is shown publicly only if both people agreed to that before submitting. Either person can ask us to
        remove a public case at any time from the case page.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided as is. Smart contracts and blockchains can fail. We aren&apos;t liable for losses beyond
        what the law requires.
      </p>
    </Prose>
  );
}
