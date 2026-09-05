import "dotenv/config";
import { Resend } from "resend";

export const ALLOWED_SENDERS = [
  "support@achswap.app",
  "admin@achswap.app",
];
// Personal addresses exist in Resend but are NOT enabled yet.
// Uncomment / add per-user mapping here when they get connected.
// const PERSONAL_SENDERS = [
//   "sukanto@achswap.app",
//   "hossain@achswap.app",
//   "asif@achswap.app",
// ];

export const DEFAULT_SENDER = ALLOWED_SENDERS[0];

export function normalizeSender(from) {
  const v = String(from || "").trim().toLowerCase();
  return ALLOWED_SENDERS.includes(v) ? v : null;
}

function getClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("Missing RESEND_API_KEY. Set it in .env locally or in Vercel env vars.");
  }
  return new Resend(key);
}

export async function sendMail({ to, subject, message, from }) {
  if (!to || !subject || !message) {
    throw new Error("Missing fields: 'to', 'subject' and 'message' are all required.");
  }
  const sender = normalizeSender(from) || DEFAULT_SENDER;
  // If caller explicitly passed a `from` that isn't allowed, reject so typos
  // (e.g. support@achwap.app) don't silently send from the wrong address.
  if (from && !normalizeSender(from)) {
    throw new Error(`Invalid 'from'. Allowed: ${ALLOWED_SENDERS.join(", ")}`);
  }
  const resend = getClient();
  // Plain-text only — no HTML template, no branding, just like a normal Gmail reply.
  const { data, error } = await resend.emails.send({
    from: sender,
    to: Array.isArray(to) ? to : [to],
    subject,
    text: message,
    replyTo: sender,
  });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data;
}
