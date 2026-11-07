"use client";

import type { ReactNode } from "react";
import { MAX_SIDE_LENGTH, MAX_TITLE_LENGTH, MIN_SIDE_LENGTH } from "@/lib/content";
import { checkSideText, checkTitle } from "@/lib/textRules";

/** A numbered step, matching the "How a case plays out" path on the home page. */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 font-display text-xl font-extrabold">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] border-ink bg-white text-base">
          {n}
        </span>
        {title}
      </h2>
      <div className="flex flex-col gap-3 sm:pl-12">{children}</div>
    </section>
  );
}

/** Two-option switch. The selected option lifts; the whole control is one tile, not two. */
export function Segmented<T extends string | number>(props: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  options: { value: T; title: ReactNode; meta?: ReactNode }[];
}) {
  const { value, onChange, label, options } = props;
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl border-[3px] border-ink bg-white p-1 shadow-[0_4px_0_0_var(--color-ink)]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors ${
              on ? "bg-verdict text-ink shadow-[inset_0_0_0_2px_var(--color-ink)]" : "text-ink/60 hover:bg-lilac"
            }`}
          >
            <span className="font-display text-base font-extrabold leading-tight sm:text-lg">{o.title}</span>
            {o.meta && <span className="text-sm leading-snug">{o.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The case as one "case file": the title reads like its headline, the story sits under a dashed rule, and the
 * counter + mic hint live in the card's footer. Errors stay hidden until the person tries to continue.
 */
export function CaseFileEditor(props: {
  title: string;
  onTitle: (v: string) => void;
  text: string;
  onText: (v: string) => void;
  attempted: boolean;
  strict: boolean;
}) {
  const { title, onTitle, text, onText, attempted, strict } = props;
  const t = checkTitle(title, { strict });
  const s = checkSideText(text, { strict });
  const len = text.trim().length;
  const counter = len < MIN_SIDE_LENGTH ? `${len}/${MIN_SIDE_LENGTH} min` : `${len}/${MAX_SIDE_LENGTH}`;
  const titleBad = attempted && t.errors.length > 0;
  const textBad = attempted && s.errors.length > 0;
  const errors = attempted ? [...t.errors, ...s.errors] : [];
  const warnings = [...new Set([...t.warnings, ...s.warnings])];

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`tile overflow-hidden focus-within:ring-4 focus-within:ring-verdict ${titleBad || textBad ? "border-side-a" : ""}`}
      >
        <label htmlFor="case-title" className="sr-only">Title</label>
        <input
          id="case-title"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Give it a title, like: Chips or sausage?"
          aria-invalid={titleBad}
          className="w-full bg-transparent px-4 pb-2 pt-4 font-display text-xl font-extrabold outline-none placeholder:font-bold placeholder:text-ink/35"
        />
        <div className="mx-4 border-t-2 border-dashed border-ink/15" />
        <label htmlFor="case-side" className="sr-only">Your side of the story</label>
        <textarea
          id="case-side"
          rows={6}
          maxLength={MAX_SIDE_LENGTH}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="My roommate says chips are the best breakfast side. I say sausage, because it actually fills you up..."
          aria-invalid={textBad}
          aria-describedby="case-side-footer"
          className="block w-full resize-none bg-transparent px-4 py-3 leading-relaxed outline-none placeholder:text-ink/40"
        />
        <div id="case-side-footer" className="flex items-center justify-between gap-3 border-t-2 border-ink/10 bg-lilac/60 px-4 py-2 text-sm text-ink/60">
          <span className="flex items-center gap-1.5">
            <MicIcon /> Tap the mic on your keyboard to speak instead.
          </span>
          <span className="shrink-0 tabular-nums" aria-live="polite">{counter}</span>
        </div>
      </div>
      {errors.map((e) => (
        <p key={e} role="alert" className="text-sm font-semibold text-side-a">{e}</p>
      ))}
      {warnings.map((w) => (
        <p key={w} className="text-sm font-semibold text-amber-700">{w}</p>
      ))}
    </div>
  );
}

/** The privacy rules as short chips instead of a paragraph. "No names" is emphasised when it's enforced. */
export function RuleChips({ strict }: { strict: boolean }) {
  const chip = "rounded-full border-2 px-2.5 py-0.5 text-xs font-bold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${chip} ${strict ? "border-side-a bg-side-a/10 text-ink" : "border-ink/20 text-ink/70"}`}>
        No names{strict ? " or @handles" : ""}
      </span>
      <span className={`${chip} border-ink/20 text-ink/70`}>No phone or email</span>
      <span className={`${chip} border-ink/20 text-ink/70`}>No links or addresses</span>
      <span className="text-xs text-ink/60">Use roles, like &ldquo;my roommate&rdquo;.</span>
    </div>
  );
}
