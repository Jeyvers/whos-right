"use client";

import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { PAY_STEP_LABEL, type PayStep } from "@/hooks/usePayFee";
import { Hint } from "./ui";

/** The pay button plus a plain line about where the G$ comes from. */
export function PayButton(props: {
  fee: bigint | undefined;
  balance: bigint;
  shortfall: bigint;
  needsClaim: boolean;
  step: PayStep;
  disabled: boolean;
  label: string;
  onPay: () => void;
}) {
  const { fee, balance, shortfall, needsClaim, step, disabled, label, onPay } = props;
  const sym = network.tokenSymbol;
  const busy = step !== "idle" && step !== "done";
  return (
    <div className="flex flex-col gap-2">
      {fee !== undefined && (
        <Hint>
          You have {formatG(balance)} {sym}.{" "}
          {shortfall > 0n
            ? `You're ${formatG(shortfall)} ${sym} short, even with today's claim.`
            : needsClaim
              ? network.testnet
                ? "Paying will first get you free test G$, then pay."
                : "Paying will first claim today's G$, then pay."
              : ""}
        </Hint>
      )}
      <button className="btn" disabled={disabled || busy || shortfall > 0n || fee === undefined} onClick={onPay}>
        {busy ? PAY_STEP_LABEL[step] : fee !== undefined ? `${label} · ${formatG(fee)} ${sym}` : label}
      </button>
      {busy && <Hint>Confirm each step in your wallet if it asks. Keep this page open.</Hint>}
    </div>
  );
}
