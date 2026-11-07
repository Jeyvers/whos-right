"use client";

import type { ReactNode } from "react";
import { MAX_SIDE_LENGTH, MIN_SIDE_LENGTH } from "@/lib/content";
import { checkSideText } from "@/lib/textRules";

/**
 * Errors stay hidden while typing (just a neutral counter); they show in red only after the person
 * tries to continue (`attempted`).
 */
export function SideEditor(props: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  attempted?: boolean;
  footnote?: ReactNode;
}) {
  const { value, onChange, label, attempted = false, footnote } = props;
  const { errors, warnings } = checkSideText(value);
  const length = value.trim().length;
  const counter = length < MIN_SIDE_LENGTH ? `${length}/${MIN_SIDE_LENGTH} minimum` : `${length}/${MAX_SIDE_LENGTH}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="side" className="font-display text-lg font-bold">{label}</label>
      <textarea
        id="side"
        rows={6}
        maxLength={MAX_SIDE_LENGTH + 50}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="My roommate says chips are the best breakfast side. I say sausage, because it actually fills you up..."
        aria-invalid={attempted && errors.length > 0}
        aria-describedby="side-help"
        className={`tile resize-y p-4 leading-relaxed outline-none placeholder:text-ink/40 focus-visible:ring-4 focus-visible:ring-verdict ${
          attempted && errors.length > 0 ? "border-side-a" : ""
        }`}
      />
      <div id="side-help" className="flex justify-between gap-2 text-sm text-ink/60">
        <span>Use roles like &ldquo;my roommate&rdquo;, not names. No phone numbers, emails, addresses or links.</span>
        <span className="shrink-0 tabular-nums" aria-live="polite">{counter}</span>
      </div>
      {attempted && errors.map((e) => <p key={e} role="alert" className="text-sm font-semibold text-side-a">{e}</p>)}
      {warnings.map((w) => <p key={w} className="text-sm font-semibold text-amber-700">{w}</p>)}
      {footnote && <p className="text-sm text-ink/50">{footnote}</p>}
    </div>
  );
}
