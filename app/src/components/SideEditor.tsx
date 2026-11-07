"use client";

import type { ReactNode } from "react";
import { MAX_SIDE_LENGTH, MAX_TITLE_LENGTH, MIN_SIDE_LENGTH } from "@/lib/content";
import { checkSideText, checkTitle } from "@/lib/textRules";

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
  /** One-sided: names and handles are blocked, not just warned about. */
  strict?: boolean;
}) {
  const { value, onChange, label, attempted = false, footnote, strict = false } = props;
  const { errors, warnings } = checkSideText(value, { strict });
  const length = value.trim().length;
  const counter = length < MIN_SIDE_LENGTH ? `${length}/${MIN_SIDE_LENGTH} minimum` : `${length}/${MAX_SIDE_LENGTH}`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="side" className="font-display text-lg font-bold">{label}</label>
      <textarea
        id="side"
        rows={6}
        maxLength={MAX_SIDE_LENGTH}
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
        <span>Keep it short. Use roles like &ldquo;my roommate&rdquo;, not names. No phone numbers, emails, addresses or links.</span>
        <span className="shrink-0 tabular-nums" aria-live="polite">{counter}</span>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-ink/60">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        Tap the mic on your keyboard to speak instead.
      </p>
      {attempted && errors.map((e) => <p key={e} role="alert" className="text-sm font-semibold text-side-a">{e}</p>)}
      {warnings.map((w) => <p key={w} className="text-sm font-semibold text-amber-700">{w}</p>)}
      {footnote && <p className="text-sm text-ink/50">{footnote}</p>}
    </div>
  );
}

/** The case title: its own short field, checked by the same privacy rules. */
export function TitleField(props: { value: string; onChange: (v: string) => void; attempted?: boolean; strict?: boolean }) {
  const { value, onChange, attempted = false, strict = false } = props;
  const { errors, warnings } = checkTitle(value, { strict });
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="title" className="font-display text-lg font-bold">Title</label>
      <input
        id="title"
        value={value}
        maxLength={MAX_TITLE_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Chips or sausage: the best breakfast side?"
        aria-invalid={attempted && errors.length > 0}
        className={`tile px-4 py-3 font-display text-lg font-bold outline-none placeholder:font-normal placeholder:text-ink/40 focus-visible:ring-4 focus-visible:ring-verdict ${
          attempted && errors.length > 0 ? "border-side-a" : ""
        }`}
      />
      <p className="text-right text-sm tabular-nums text-ink/60">{value.trim().length}/{MAX_TITLE_LENGTH}</p>
      {attempted && errors.map((e) => <p key={e} role="alert" className="text-sm font-semibold text-side-a">{e}</p>)}
      {warnings.map((w) => <p key={w} className="text-sm font-semibold text-amber-700">{w}</p>)}
    </div>
  );
}
