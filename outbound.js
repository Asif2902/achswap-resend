import crypto from "node:crypto";
import { EMAIL_DOMAIN } from "./auth.js";
import { sendMail, getSentEmail } from "./provider.js";
import {
  MailError,
  allowed,
  marks,
  parse,
  identifiers,
  addressList,
  conversation,
} from "./mailbox.js";
import {
  sanitizeEmailHtml,
  textToHtml,
  htmlToPlainText,
  replyRecipients,
  subjectFor,
} from "./email-html.js";

export async function prepareSend(db, user, input) {
  const senders = allowed(user);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId || ""))
    throw new MailError(400, "A valid send request ID is required.");
  const body = String(input.message || "");
  const htmlInput = input.html == null ? "" : String(input.html);
  if (Buffer.byteLength(body) > 100000)
    throw new MailError(400, "Write a message of up to 100 KB.");
  if (Buffer.byteLength(htmlInput) > 200000)
    throw new MailError(400, "HTML message is too large.");
  const html = htmlInput.trim()
    ? sanitizeEmailHtml(htmlInput)
    : body.trim()
      ? textToHtml(body)
      : "";
  const text = body.trim() || htmlToPlainText(html);
  if (!text.trim() && !html.trim())
    throw new MailError(400, "Write a message of up to 100 KB.");
  const signature = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        replyTo: input.replyTo || null,
        from: input.from || null,
        to: input.to || null,
        cc: input.cc || null,
        bcc: input.bcc || null,
        subject: input.subject || null,
        message: body,
        html: htmlInput,
        mode: input.mode || null,
      }),
    )
    .digest("hex");
  const tx = await db.transaction("write");
  try {
    const old = (
      await tx.execute({
        sql: "SELECT * FROM messages WHERE created_by=? AND idempotency_key=?",
        args: [user.email, input.requestId],
      })
    ).rows[0];
    if (old) {
      if (old.request_hash !== signature)
        throw new MailError(
          409,
          "This send request already has different content.",
        );
      if (!senders.includes(old.inbox_address))
        throw new MailError(403, "Mailbox access denied.");
      await tx.rollback();
      return old;
    }
    let thread,
      parent,
      from,
      to,
      subject,
      cc = [],
      bcc = [];
    const mode = ["reply", "replyAll", "forward"].includes(input.mode)
      ? input.mode
      : input.replyTo
        ? "reply"
        : "compose";
    if (input.replyTo) {
      parent = (
        await tx.execute({
          sql: `SELECT * FROM messages WHERE id=? AND inbox_address IN (${marks(senders)})`,
          args: [input.replyTo, ...senders],
        })
      ).rows[0];
      if (!parent) throw new MailError(404, "Message not found.");
      if (parent.delivery_status === "pending")
        throw new MailError(
          409,
          "Finish sending this message before replying.",
        );
      thread = await conversation(tx, user, parent.conversation_id);
      from = thread.inbox_address;
      if (input.from && input.from !== from)
        throw new MailError(
          403,
          "Replies must use this conversation’s inbox address.",
        );
      const defaults = replyRecipients(
        {
          ...parent,
          to: parse(parent.to_header),
          cc: parse(parent.cc),
          reply_to: parse(parent.reply_to),
        },
        from,
        mode,
      );
      to = input.to != null ? addressList(input.to) : defaults.to;
      cc = input.cc != null ? addressList(input.cc) : defaults.cc;
      bcc = addressList(input.bcc || []);
      subject =
        mode === "forward"
          ? String(input.subject || subjectFor(parent.subject, "forward")).trim()
          : subjectFor(parent.subject, "reply");
    } else {
      from = String(input.from || "")
        .trim()
        .toLowerCase();
      if (!senders.includes(from))
        throw new MailError(403, "You cannot send from that inbox.");
      to = addressList(input.to);
      cc = addressList(input.cc || []);
      bcc = addressList(input.bcc || []);
      subject = String(input.subject || "").trim();
    }
    if (!to.length)
      throw new MailError(400, "This email has no valid reply recipient.");
    if (!subject || subject.length > 998 || /[\r\n]/.test(subject))
      throw new MailError(400, "Enter a subject of up to 998 characters.");
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    if (!thread) {
      thread = { id: crypto.randomUUID(), inbox_address: from };
      const type =
        from === `support@${EMAIL_DOMAIN}`
          ? "support"
          : from === `admin@${EMAIL_DOMAIN}`
            ? "admin"
            : "personal";
      await tx.execute({
        sql: "INSERT INTO conversations (id,inbox_type,inbox_address,subject,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        args: [thread.id, type, from, subject, now, now],
      });
    }
    const refs = [
      ...new Set([
        ...identifiers(parent?.references),
        ...identifiers(parent?.in_reply_to),
        ...identifiers(parent?.message_id),
      ]),
    ]
      .slice(-90)
      .join(" ");
    await tx.execute({
      sql: `INSERT INTO messages (id,conversation_id,inbox_address,dedupe_key,direction,from_email,from_name,envelope_from,
      to_email,to_header,cc,bcc,subject,text_body,html_body,received_at,created_at,in_reply_to,"references",delivery_status,created_by,idempotency_key,request_hash)
      VALUES (${Array(23).fill("?").join(",")})`,
      args: [
        id,
        thread.id,
        from,
        `outbound:${id}`,
        "outbound",
        from,
        "",
        from,
        to[0].address,
        JSON.stringify(to),
        JSON.stringify(cc),
        JSON.stringify(bcc),
        subject,
        text,
        html || null,
        now,
        now,
        parent?.message_id || null,
        refs || null,
        "pending",
        user.email,
        input.requestId,
        signature,
      ],
    });
    await tx.execute({
      sql: "UPDATE conversations SET updated_at=max(updated_at,?) WHERE id=?",
      args: [now, thread.id],
    });
    const row = (
      await tx.execute({ sql: "SELECT * FROM messages WHERE id=?", args: [id] })
    ).rows[0];
    await tx.commit();
    return row;
  } finally {
    tx.close();
  }
}
export async function deliver(
  db,
  user,
  id,
  provider = { send: sendMail, get: getSentEmail },
) {
  const senders = allowed(user);
  let row = (
    await db.execute({
      sql: `SELECT * FROM messages WHERE id=? AND direction='outbound' AND created_by=? AND inbox_address IN (${marks(senders)})`,
      args: [id, user.email, ...senders],
    })
  ).rows[0];
  if (!row) throw new MailError(404, "Outgoing message not found.");
  if (row.delivery_status === "sent" && row.message_id)
    return { id: row.id, conversationId: row.conversation_id, status: "sent" };
  if (!row.provider_id) {
    if (
      row.send_started_at &&
      Date.now() - Date.parse(row.send_started_at) > 23 * 60 * 60 * 1000
    )
      throw new MailError(
        409,
        "Send status is uncertain. Check Resend before sending again; automatic retry has expired.",
      );
    await db.execute({
      sql: "UPDATE messages SET send_started_at=coalesce(send_started_at,?) WHERE id=?",
      args: [new Date().toISOString(), id],
    });
    let result;
    try {
      result = await provider.send(row);
    } catch {
      throw new MailError(
        502,
        "Send was not confirmed. Your message is saved; retry this same message to check safely.",
      );
    }
    if (!result?.id)
      throw new MailError(
        502,
        "Email provider did not confirm the send. Retry this saved message.",
      );
    await db.execute({
      sql: "UPDATE messages SET provider_id=?,delivery_status='sent' WHERE id=?",
      args: [result.id, id],
    });
    row = { ...row, provider_id: result.id, delivery_status: "sent" };
  }
  let metadata;
  try {
    metadata = await provider.get(row.provider_id);
  } catch {
    return {
      id,
      conversationId: row.conversation_id,
      status: "sent",
      threadingPending: true,
    };
  }
  const messageId = identifiers(metadata.message_id)[0];
  if (!messageId)
    return {
      id,
      conversationId: row.conversation_id,
      status: "sent",
      threadingPending: true,
    };
  const tx = await db.transaction("write");
  try {
    row = (
      await tx.execute({ sql: "SELECT * FROM messages WHERE id=?", args: [id] })
    ).rows[0];
    const relationship = (
      await tx.execute({
        sql: "SELECT conversation_id FROM thread_message_ids WHERE inbox_address=? AND message_id=?",
        args: [row.inbox_address, messageId],
      })
    ).rows[0];
    if (relationship && relationship.conversation_id !== row.conversation_id) {
      const loser = relationship.conversation_id;
      await tx.batch([
        {
          sql: "UPDATE conversations SET created_at=min(created_at,(SELECT created_at FROM conversations WHERE id=?)),updated_at=max(updated_at,(SELECT updated_at FROM conversations WHERE id=?)) WHERE id=?",
          args: [loser, loser, row.conversation_id],
        },
        {
          sql: "UPDATE messages SET conversation_id=? WHERE conversation_id=? AND inbox_address=?",
          args: [row.conversation_id, loser, row.inbox_address],
        },
        {
          sql: "UPDATE thread_message_ids SET conversation_id=? WHERE conversation_id=? AND inbox_address=?",
          args: [row.conversation_id, loser, row.inbox_address],
        },
        {
          sql: "DELETE FROM conversations WHERE id=? AND inbox_address=?",
          args: [loser, row.inbox_address],
        },
      ]);
    }
    await tx.execute({
      sql: "UPDATE messages SET message_id=?,message_id_raw=? WHERE id=?",
      args: [messageId, messageId, id],
    });
    await tx.execute({
      sql: "INSERT INTO thread_message_ids (inbox_address,message_id,conversation_id) VALUES (?,?,?) ON CONFLICT DO NOTHING",
      args: [row.inbox_address, messageId, row.conversation_id],
    });
    await tx.commit();
    return { id, conversationId: row.conversation_id, status: "sent" };
  } finally {
    tx.close();
  }
}
