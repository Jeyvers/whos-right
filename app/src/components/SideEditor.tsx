"use client";

import { MAX_SIDE_LENGTH } from "@/lib/content";
import { checkSideText } from "@/lib/textRules";

export function SideEditor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { errors, warnings } = checkSideText(value);
  const showErrors = value.trim().length > 0;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="side" className="font-display text-lg font-bold">{label}</label>
      <textarea
        id="side"
        rows={6}
        maxLength={MAX_SIDE_LENGTH + 50}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="My roommate never does the dishes but says it's my turn because…"
        className="tile resize-y p-4 leading-relaxed outline-none focus-visible:ring-4 focus-visible:ring-verdict"
      />
      <div className="flex justify-between text-sm text-ink/60">
        <span>Use roles like &ldquo;my roommate&rdquo;, not names. No phone numbers, emails, addresses or links.</span>
        <span className="shrink-0 pl-2">{value.trim().length}/{MAX_SIDE_LENGTH}</span>
      </div>
      {showErrors && errors.map((e) => <p key={e} className="text-sm font-semibold text-side-a">{e}</p>)}
      {warnings.map((w) => <p key={w} className="text-sm font-semibold text-amber-700">{w}</p>)}
    </div>
  );
}

export function PublicConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border-2 border-ink/20 bg-white p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-court"
      />
      <span className="text-sm">
        <strong>I understand this case may be shown publicly</strong> once both sides have agreed to it, so anyone can
        read both sides and the verdict. Either side can ask for it to be removed at any time.{" "}
        <a href="/privacy" target="_blank" className="underline">Privacy</a>
      </span>
    </label>
  );
}
