import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

export const metadata: Metadata = { title: "Privacy · Who's Right?" };

export default function Privacy() {
  return (
    <Prose>
      <h1>Privacy</h1>
      <p className="text-sm text-zinc-600">Draft, last updated 7 November 2026.</p>

      <h2>What we store</h2>
      <ul>
        <li>Your sign-in (through Privy) and your wallet address.</li>
        <li>The text of cases you write, your choice about public visibility, and any reports you make.</li>
        <li>Basic usage counts (cases, jurors, fees paid and earned).</li>
      </ul>

      <h2>What goes on the blockchain</h2>
      <p>
        Payments, votes and verdicts are recorded on Celo, which is public and permanent. Case text is never put on the
        blockchain; only a fingerprint (hash) of it is, so the text can&apos;t be read from the chain.
      </p>

      <h2>Who sees your case</h2>
      <ul>
        <li>The other person and the drawn jurors always see the case text.</li>
        <li>Everyone else can see it too: cases are public, which you agree to once when you sign up.</li>
        <li>Either person can take a case off public view at any time from the case page.</li>
      </ul>

      <h2>Verification</h2>
      <p>
        Face verification is done by GoodDollar, not by us. We only read whether your wallet is verified. We never see
        or store your face scan.
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can ask us to delete case text and reports linked to you. Blockchain records can&apos;t be deleted by anyone.
      </p>
    </Prose>
  );
}
