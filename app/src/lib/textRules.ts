import { MAX_SIDE_LENGTH, MAX_TITLE_LENGTH, MIN_SIDE_LENGTH, MIN_TITLE_LENGTH } from "./content";

export type TextCheck = { errors: string[]; warnings: string[] };
export type RuleOptions = {
  /**
   * One-sided cases: the other person can't reply, so anything that could identify them is blocked outright
   * (full names, @handles, "named X") instead of only warned about.
   */
  strict?: boolean;
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|app|xyz|ng|uk|gh|ke|za)\b/i;
const PHONE = /(?:\+?\d[\s().-]?){7,}/;
const ADDRESS =
  /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:street|st|road|rd|avenue|ave|close|crescent|lane|ln|drive|dr|way|boulevard|blvd|court|ct)\b/i;
// Two capitalised words not at a sentence start, e.g. "John Smith". A hint, not proof.
const FULL_NAME = /(?<![.!?]\s|^)\b[A-Z][a-z]{1,}\s[A-Z][a-z]{1,}\b/;
const HANDLE = /(?:^|\s)@[A-Za-z0-9_.]{2,}/;
const NAMED = /\b(?:named|called|name is|name's)\s+[A-Z][a-z]+/;

function contentRules(t: string, strict: boolean, errors: string[], warnings: string[]) {
  if (EMAIL.test(t)) errors.push("Remove the email address.");
  if (LINK.test(t)) errors.push("Remove the link.");
  if (PHONE.test(t)) errors.push("Remove the phone number.");
  if (ADDRESS.test(t)) errors.push("Remove the street address.");
  if (HANDLE.test(t)) (strict ? errors : warnings).push("Remove the @handle. Use a role instead.");
  if (FULL_NAME.test(t) || NAMED.test(t)) {
    if (strict) errors.push("Remove the name. They can't reply here, so use a role like “my roommate”.");
    else warnings.push("This looks like a full name. Use roles instead, like “my roommate”.");
  }
}

/** Same rules on the client (instant feedback) and the server (enforced). */
export function checkSideText(text: string, opts: RuleOptions = {}): TextCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const t = text.trim();
  if (t.length < MIN_SIDE_LENGTH) errors.push(`Write at least ${MIN_SIDE_LENGTH} characters.`);
  if (t.length > MAX_SIDE_LENGTH) errors.push(`Keep it under ${MAX_SIDE_LENGTH} characters.`);
  contentRules(t, Boolean(opts.strict), errors, warnings);
  return { errors, warnings };
}

export function checkTitle(title: string, opts: RuleOptions = {}): TextCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const t = title.trim();
  if (t.length < MIN_TITLE_LENGTH) errors.push(`Give your case a title (at least ${MIN_TITLE_LENGTH} characters).`);
  if (t.length > MAX_TITLE_LENGTH) errors.push(`Keep the title under ${MAX_TITLE_LENGTH} characters.`);
  contentRules(t, Boolean(opts.strict), errors, warnings);
  // "Remove the link." -> "Remove the link from the title." (length messages already say "title").
  return { errors: errors.map((e) => (e.startsWith("Remove the ") ? e.replace(/\.$/, " from the title.") : e)), warnings };
}
