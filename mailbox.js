import { EMAIL_DOMAIN, getAllowedSendersForUser } from "./auth.js";
import { convert } from "html-to-text";
import { sanitizeEmailHtml, stripPreview } from "./email-html.js";
export class MailError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const marks = (list) => list.map(() => "?").join(",");
export const parse = (value) => {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
};
export const identifiers = (value) => [
  ...new Set(String(value || "").match(/<[^<>\s]+@[^<>\s]+>/g) || []),
];
export function allowed(user) {
  const addresses = getAllowedSendersForUser(user.email);
  if (!addresses.length)
    throw new MailError(403, "Mailbox access is not available.");
  return addresses;
}
export function addressList(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[,;]/);
  const result = [
    ...new Set(
      values.map((v) => String(v).trim().toLowerCase()).filter(Boolean),
    ),
  ];
  if (
    result.length > 20 ||
    result.some(
      (v) =>
        v.length > 254 ||
        !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(v),
    )
  ) {
    throw new MailError(
      400,
      "Enter valid recipient email addresses (up to 20).",
    );
  }
  return result.map((address) => ({ name: "", address }));
}
export async function conversation(db, user, id) {
  const addresses = allowed(user);
  const result = await db.execute({
    sql: `SELECT * FROM conversations WHERE id = ? AND inbox_address IN (${marks(addresses)})`,
    args: [id, ...addresses],
  });
  if (!result.rows.length) throw new MailError(404, "Conversation not found.");
  return result.rows[0];
}
export async function listConversations(db, user, query = {}) {
  const addresses = allowed(user);
  const selected =
    query.inbox === "support"
      ? `support@${EMAIL_DOMAIN}`
      : query.inbox === "admin"
        ? `admin@${EMAIL_DOMAIN}`
        : query.inbox === "personal"
          ? user.email
          : null;
  if (
    query.inbox &&
    !["all", "support", "admin", "personal"].includes(query.inbox)
  )
    throw new MailError(400, "Invalid inbox filter.");
  if (query.view && !["all", "unread", "sent"].includes(query.view))
    throw new MailError(400, "Invalid mail filter.");
  const filters = [`c.inbox_address IN (${marks(addresses)})`];
  const args = [...addresses];
  if (selected) {
    filters.push("c.inbox_address = ?");
    args.push(selected);
  }
  if (query.view === "sent")
    filters.push(
      "EXISTS (SELECT 1 FROM messages s WHERE s.conversation_id=c.id AND s.direction='outbound' AND s.delivery_status='sent')",
    );
  if (query.view === "unread") {
    filters.push(
      "EXISTS (SELECT 1 FROM messages s WHERE s.conversation_id=c.id AND s.direction='inbound' AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message_fk=s.id AND r.user_email=?))",
    );
    args.push(user.email);
  }
  if (query.q) {
    const q = `%${String(query.q).slice(0, 200).replace(/[!%_]/g, "!$&")}%`;
    filters.push(
      "EXISTS (SELECT 1 FROM messages s WHERE s.conversation_id=c.id AND (s.subject LIKE ? ESCAPE '!' OR s.from_email LIKE ? ESCAPE '!' OR s.text_body LIKE ? ESCAPE '!'))",
    );
    args.push(q, q, q);
  }
  if (query.cursor) {
    let cursor;
    try {
      cursor = JSON.parse(
        Buffer.from(String(query.cursor), "base64url").toString(),
      );
    } catch {
      throw new MailError(400, "Invalid page cursor.");
    }
    if (
      !Array.isArray(cursor) ||
      cursor.length !== 2 ||
      cursor.some((v) => typeof v !== "string")
    )
      throw new MailError(400, "Invalid page cursor.");
    filters.push("(c.updated_at < ? OR (c.updated_at = ? AND c.id < ?))");
    args.push(cursor[0], cursor[0], cursor[1]);
  }
  const rows = (
    await db.execute({
      sql: `SELECT c.*, m.from_email, m.from_name, substr(coalesce(nullif(m.text_body,''), m.html_body),1,400) AS preview,
    (SELECT count(*) FROM messages n WHERE n.conversation_id=c.id) AS message_count,
    (SELECT count(*) FROM messages n WHERE n.conversation_id=c.id AND n.direction='inbound' AND NOT EXISTS
      (SELECT 1 FROM message_reads r WHERE r.message_fk=n.id AND r.user_email=?)) AS unread_count
    FROM conversations c JOIN messages m ON m.id=(SELECT n.id FROM messages n WHERE n.conversation_id=c.id ORDER BY n.received_at DESC,n.id DESC LIMIT 1)
    WHERE ${filters.join(" AND ")} ORDER BY c.updated_at DESC,c.id DESC LIMIT 31`,
      args: [user.email, ...args],
    })
  ).rows;
  const items = rows.slice(0, 30).map((row) => ({
    ...row,
    preview: stripPreview(row.preview),
  }));
  const counts = (
    await db.execute({
      sql: `SELECT m.inbox_address, count(*) AS unread FROM messages m WHERE m.inbox_address IN (${marks(addresses)})
    AND m.direction='inbound' AND NOT EXISTS (SELECT 1 FROM message_reads r WHERE r.message_fk=m.id AND r.user_email=?) GROUP BY m.inbox_address`,
      args: [...addresses, user.email],
    })
  ).rows;
  return {
    conversations: items,
    unread: Object.fromEntries(
      counts.map((r) => [r.inbox_address, Number(r.unread)]),
    ),
    nextCursor:
      rows.length > 30
        ? Buffer.from(
            JSON.stringify([items.at(-1).updated_at, items.at(-1).id]),
          ).toString("base64url")
        : null,
  };
}
export async function getConversation(db, user, id, before) {
  const thread = await conversation(db, user, id);
  const args = [id];
  let clause = "";
  if (before) {
    const anchor = (
      await db.execute({
        sql: "SELECT received_at,id FROM messages WHERE id=? AND conversation_id=?",
        args: [before, id],
      })
    ).rows[0];
    if (!anchor) throw new MailError(400, "Invalid message cursor.");
    clause = " AND (received_at < ? OR (received_at = ? AND id < ?))";
    args.push(anchor.received_at, anchor.received_at, anchor.id);
  }
  const rows = (
    await db.execute({
      sql: `SELECT * FROM messages WHERE conversation_id=?${clause} ORDER BY received_at DESC,id DESC LIMIT 51`,
      args,
    })
  ).rows;
  const page = rows.slice(0, 50).reverse();
  const attachments = page.length
    ? (
        await db.execute({
          sql: `SELECT id,message_fk,filename,content_type,size_bytes,storage_status FROM attachments WHERE message_fk IN (${marks(page)}) ORDER BY position`,
          args: page.map((r) => r.id),
        })
      ).rows
    : [];
  return {
    conversation: thread,
    messages: page.map((row) => {
      const html = row.html_body ? sanitizeEmailHtml(row.html_body) : "";
      const displayText =
        row.text_body ||
        convert(String(row.html_body || ""), {
          wordwrap: false,
          selectors: [
            { selector: "img", format: "skip" },
            { selector: "style", format: "skip" },
            { selector: "a", options: { ignoreHref: true } },
          ],
        });
      return {
        id: row.id,
        conversation_id: row.conversation_id,
        direction: row.direction,
        from_email: row.from_email,
        from_name: row.from_name,
        to: parse(row.to_header),
        cc: parse(row.cc),
        bcc: parse(row.bcc),
        reply_to: parse(row.reply_to),
        subject: row.subject,
        text_body: row.text_body,
        html_body: html || undefined,
        display_text: displayText,
        received_at: row.received_at,
        delivery_status: row.delivery_status,
        message_id: row.message_id,
        created_by: row.created_by,
        can_retry:
          row.direction === "outbound" &&
          row.created_by === user.email &&
          (row.delivery_status !== "sent" || !row.message_id),
        attachments: attachments.filter((a) => a.message_fk === row.id),
      };
    }),
    olderCursor: rows.length > 50 ? page[0].id : null,
  };
}
export async function markRead(db, user, messageIds) {
  if (
    !Array.isArray(messageIds) ||
    messageIds.length > 100 ||
    messageIds.some((id) => typeof id !== "string")
  )
    throw new MailError(400, "Invalid messages.");
  if (!messageIds.length) return;
  const addresses = allowed(user);
  await db.execute({
    sql: `INSERT INTO message_reads (message_fk,user_email) SELECT id,? FROM messages
    WHERE id IN (${marks(messageIds)}) AND inbox_address IN (${marks(addresses)}) AND direction='inbound' ON CONFLICT DO NOTHING`,
    args: [user.email, ...messageIds, ...addresses],
  });
}
