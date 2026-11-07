"use client";

import { formatG } from "@/lib/format";
import { network } from "@/lib/network";
import { PAY_STEP_LABEL, type PayPlan, type PayStep } from "@/hooks/usePayFee";
import { Hint } from "./ui";
import { Spinner } from "./Loading";

/** Summary of exactly what one tap will do, then the button. */
export function PayButton(props: {
  fee: bigint | undefined;
  balance: bigint;
  plan: PayPlan | undefined;
  step: PayStep;
  disabled: boolean;
  label: string;
  onPay: () => void;
}) {
  const { fee, balance, plan, step, disabled, label, onPay } = props;
  const sym = network.tokenSymbol;
  const busy = step !== "idle" && step !== "done";
  const short = plan && plan.shortfall > 0n;
  return (
    <div className="flex flex-col gap-3">
      {plan && fee !== undefined && !short && plan.summary.length > 1 && (
        <div className="rounded-xl bg-lilac p-3 text-sm">
          <p className="font-bold">One tap will:</p>
          <ol className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {plan.summary.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden className="text-ink/40">→</span>}
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {fee !== undefined && (
        <Hint>
          You have {formatG(balance)} {sym}.

          {!network.testnet && !short && " Your wallet asks you to confirm."}
          {" "}Network fees are covered for you, up to a daily limit.
        </Hint>
      )}
      {short && plan?.blocked && (
        <p role="status" className="rounded-xl border-2 border-side-a bg-side-a/10 p-3 text-sm font-semibold">{plan.blocked}</p>
      )}
      <button className="btn" disabled={disabled || busy || Boolean(short) || fee === undefined} onClick={onPay}>
        {busy ? <><Spinner /> {PAY_STEP_LABEL[step]}</> : fee !== undefined ? `${label} · ${formatG(fee)} ${sym}` : label}
      </button>
      {busy && <Hint>Keep this page open.</Hint>}
    </div>
  );
}
