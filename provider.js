import "dotenv/config";
// Only called with a server-authorized, persisted outbound message.
async function request(path, options = {}) {
  if (!process.env.RESEND_API_KEY) throw new Error("Sending is not configured");
  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Email provider request failed");
  return response.json();
}
function addresses(value) {
  try {
    return JSON.parse(value || "[]")
      .map((entry) => entry.address)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function buildSendPayload(row) {
  const headers = {};
  if (row.in_reply_to) headers["In-Reply-To"] = row.in_reply_to;
  if (row.references) headers.References = row.references;
  const payload = {
    from: row.from_email,
    to: addresses(row.to_header),
    subject: row.subject,
    text: row.text_body || "",
    reply_to: row.from_email,
  };
  const cc = addresses(row.cc);
  const bcc = addresses(row.bcc);
  if (cc.length) payload.cc = cc;
  if (bcc.length) payload.bcc = bcc;
  if (row.html_body) payload.html = row.html_body;
  if (Object.keys(headers).length) payload.headers = headers;
  return payload;
}

export async function sendMail(row) {
  return request("/emails", {
    method: "POST",
    headers: { "Idempotency-Key": `achswap/${row.id}` },
    body: JSON.stringify(buildSendPayload(row)),
  });
}
export async function getSentEmail(providerId) {
  return request(`/emails/${encodeURIComponent(providerId)}`);
}
