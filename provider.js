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
export async function sendMail(row) {
  const headers = {};
  if (row.in_reply_to) headers["In-Reply-To"] = row.in_reply_to;
  if (row.references) headers.References = row.references;
  return request("/emails", {
    method: "POST",
    headers: { "Idempotency-Key": `achswap/${row.id}` },
    body: JSON.stringify({
      from: row.from_email,
      to: JSON.parse(row.to_header).map((a) => a.address),
      cc: JSON.parse(row.cc).map((a) => a.address),
      subject: row.subject,
      text: row.text_body,
      reply_to: row.from_email,
      headers,
    }),
  });
}
export async function getSentEmail(providerId) {
  return request(`/emails/${encodeURIComponent(providerId)}`);
}
