export async function seed(
  db,
  address,
  id = "seed",
  subject = "A question",
  options = {},
) {
  const now = options.date || "2026-09-05T10:00:00.000Z";
  const type = address.startsWith("support@")
    ? "support"
    : address.startsWith("admin@")
      ? "admin"
      : "personal";
  await db.execute({
    sql: "INSERT INTO conversations VALUES (?,?,?,?,?,?)",
    args: [id, type, address, subject, now, now],
  });
  await db.execute({
    sql: `INSERT INTO messages (id,conversation_id,inbox_address,message_id,dedupe_key,direction,from_email,from_name,envelope_from,to_email,to_header,cc,bcc,subject,text_body,html_body,received_at,created_at,reply_to)
    VALUES (?,?,?,?,?,'inbound',?,?, 'bounce@example.net',?,?,?,?,?,?,?,?,?,?)`,
    args: [
      `m-${id}`,
      id,
      address,
      `<${id}@example.net>`,
      `id:${id}`,
      options.fromEmail || "customer@example.net",
      options.fromName || "Jane Customer",
      address,
      JSON.stringify(options.to || []),
      JSON.stringify(options.cc || []),
      JSON.stringify(options.bcc || []),
      subject,
      options.text ?? "Hello team",
      options.html ?? null,
      now,
      now,
      JSON.stringify(options.replyTo || []),
    ],
  });
  await db.execute({
    sql: "INSERT INTO thread_message_ids VALUES (?,?,?)",
    args: [address, `<${id}@example.net>`, id],
  });
}
