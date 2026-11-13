import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Email through Resend's REST API. Off unless RESEND_API_KEY and EMAIL_FROM are set (EMAIL_FROM must be on a domain
 * verified in Resend, e.g. "Rest My Case <alerts@your-domain>"). Every email carries a one-click unsubscribe link.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.EMAIL_UNSUBSCRIBE_SECRET);
}

export const appUrl = () => (process.env.APP_URL ?? "https://whos-right-nine.vercel.app").replace(/\/$/, "");

function sign(userId: string): string {
  return createHmac("sha256", process.env.EMAIL_UNSUBSCRIBE_SECRET ?? "").update(`unsubscribe:${userId}`).digest("base64url");
}

export function unsubscribeUrl(userId: string): string {
  return `${appUrl()}/api/notify/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
}

export function validUnsubscribe(userId: string, token: string): boolean {
  if (!process.env.EMAIL_UNSUBSCRIBE_SECRET || !userId || !token) return false;
  const a = Buffer.from(sign(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type EmailMessage = { subject: string; heading: string; body: string; cta: string; path: string };

function render(m: EmailMessage, unsubscribe: string) {
  const link = appUrl() + m.path;
  const html = `<!doctype html><html><body style="margin:0;background:#f3efff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1035">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:3px solid #1b1035;border-radius:20px">
<tr><td style="background:#3d1e8c;border-radius:16px 16px 0 0;padding:16px 24px;color:#ffffff;font-size:18px;font-weight:800">⚖️ Rest My Case</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${esc(m.heading)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">${esc(m.body)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#ffc93c;color:#1b1035;border:3px solid #1b1035;border-radius:14px;padding:12px 22px;font-weight:800;text-decoration:none">${esc(m.cta)}</a>
</td></tr></table>
<p style="max-width:480px;font-size:12px;color:#6b6385;line-height:1.5;margin:16px 0 0">You get this because you use Rest My Case.
<a href="${esc(unsubscribe)}" style="color:#6b6385">Turn off emails</a> · or change alerts in Account.</p>
</td></tr></table></body></html>`;
  const text = `${m.heading}\n\n${m.body}\n\n${m.cta}: ${link}\n\nTurn off emails: ${unsubscribe}`;
  return { html, text };
}

/** Sends one email. Returns false (never throws) if email isn't configured or Resend refuses it. */
export async function sendEmail(to: string, userId: string, m: EmailMessage, idempotencyKey?: string): Promise<boolean> {
  if (!emailConfigured()) return false;
  const unsubscribe = unsubscribeUrl(userId);
  const { html, text } = render(m, unsubscribe);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject: m.subject,
      html,
      text,
      headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
  }).catch(() => null);
  return Boolean(res?.ok);
}
