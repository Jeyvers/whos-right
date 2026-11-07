import { MAX_SIDE_LENGTH, MIN_SIDE_LENGTH } from "./content";

export type TextCheck = { errors: string[]; warnings: string[] };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const LINK = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|app|xyz|ng|uk|gh|ke|za)\b/i;
const PHONE = /(?:\+?\d[\s().-]?){7,}/;
const ADDRESS =
  /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:street|st|road|rd|avenue|ave|close|crescent|lane|ln|drive|dr|way|boulevard|blvd|court|ct)\b/i;
// Two capitalised words not at a sentence start, e.g. "John Smith". A hint, not proof.
const FULL_NAME = /(?<![.!?]\s|^)\b[A-Z][a-z]{1,}\s[A-Z][a-z]{1,}\b/;

/** Same rules on the client (instant feedback) and the server (enforced). */
export function checkSideText(text: string): TextCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const t = text.trim();
  if (t.length < MIN_SIDE_LENGTH) errors.push(`Write at least ${MIN_SIDE_LENGTH} characters.`);
  if (t.length > MAX_SIDE_LENGTH) errors.push(`Keep it under ${MAX_SIDE_LENGTH} characters.`);
  if (EMAIL.test(t)) errors.push("Remove the email address.");
  if (LINK.test(t)) errors.push("Remove the link.");
  if (PHONE.test(t)) errors.push("Remove the phone number.");
  if (ADDRESS.test(t)) errors.push("Remove the street address.");
  if (FULL_NAME.test(t)) warnings.push("This looks like a full name. Use roles instead, like “my roommate”.");
  return { errors, warnings };
}
