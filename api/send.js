import { sendMail, ALLOWED_SENDERS, normalizeSender } from "../send.js";

function parseBody(req) {
  // Vercel (Node runtime) auto-parses JSON bodies, but handle string just in case.
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    // Handy for populating the From dropdown / health checks.
    return res.status(200).json({ ok: true, senders: ALLOWED_SENDERS });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { to, subject, message, from } = parseBody(req) || {};

    if (!to || !subject || !message) {
      return res.status(400).json({ error: "Fields required: to, subject, message" });
    }

    if (from && !normalizeSender(from)) {
      return res
        .status(400)
        .json({ error: `Invalid 'from'. Allowed: ${ALLOWED_SENDERS.join(", ")}` });
    }

    const list = Array.isArray(to)
      ? to
      : String(to).split(",").map((s) => s.trim()).filter(Boolean);

    if (!list.length || !list.every((e) => /.+@.+\..+/.test(e))) {
      return res.status(400).json({ error: "Invalid 'to' email address." });
    }

    const data = await sendMail({
      to: list,
      subject: String(subject),
      message: String(message),
      from: from ? normalizeSender(from) : undefined,
    });

    return res.status(200).json({ ok: true, id: data?.id, data });
  } catch (e) {
    console.error("send failed:", e);
    return res.status(500).json({ error: e.message || "Send failed" });
  }
}
