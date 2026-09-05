import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { migrate } from "../scripts/migrate.mjs";
import { listConversations, getConversation, markRead } from "../mailbox.js";
import { prepareSend, deliver } from "../outbound.js";
import {
  getAllowedSendersForUser,
  verifyCredentials,
  createSessionToken,
  verifySessionToken,
} from "../auth.js";
process.env.TEAM_USERS_JSON = JSON.stringify([
  { email: "asif@achswap.app", password: "local-test" },
  { email: "john@achswap.app", password: "local-test" },
]);
process.env.AUTH_SECRET = "test-only-session-secret-123456789";
const asif = { email: "asif@achswap.app" },
  john = { email: "john@achswap.app" };
let db;
beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
});
afterEach(() => db.close());
import { seed } from "./fixtures.js";

const input = (extra = {}) => ({
  requestId: crypto.randomUUID(),
  from: "asif@achswap.app",
  to: "customer@example.net",
  subject: "Hello",
  message: "A thoughtful response.",
  ...extra,
});
test("dynamic login retains shared senders, denies another personal sender", () => {
  assert.deepEqual(getAllowedSendersForUser(asif.email), [
    "support@achswap.app",
    "admin@achswap.app",
    asif.email,
  ]);
  assert.ok(verifyCredentials(john.email, "local-test"));
  assert.equal(verifyCredentials(john.email, "wrong"), null);
  const token = createSessionToken(asif.email);
  assert.equal(verifySessionToken(token).email, asif.email);
  assert.equal(verifySessionToken(token + "x"), null);
});
test("all filters and direct ID access enforce personal isolation", async () => {
  for (const [id, email] of [
    ["mine", asif.email],
    ["other", john.email],
    ["support", "support@achswap.app"],
    ["admin", "admin@achswap.app"],
  ])
    await seed(db, email, id);
  assert.equal((await listConversations(db, asif)).conversations.length, 3);
  for (const inbox of ["personal", "support", "admin"])
    assert.equal(
      (await listConversations(db, asif, { inbox })).conversations.length,
      1,
    );
  await assert.rejects(getConversation(db, asif, "other"), { status: 404 });
  assert.equal(
    (await listConversations(db, asif, { q: "other" })).conversations.length,
    0,
  );
});
test("read state is personal and only visible messages can be marked", async () => {
  await seed(db, "support@achswap.app", "support");
  await seed(db, john.email, "private");
  await markRead(db, asif, ["m-support", "m-private"]);
  assert.equal(
    (await listConversations(db, asif, { view: "unread" })).conversations
      .length,
    0,
  );
  assert.equal(
    (await listConversations(db, john, { view: "unread" })).conversations
      .length,
    2,
  );
  assert.equal(
    (await db.execute("SELECT count(*) n FROM message_reads")).rows[0].n,
    1,
  );
});
test("reply sender is server derived, uses Reply-To and stays in the same thread", async () => {
  for (const [id, email] of [
    ["mine", asif.email],
    ["support", "support@achswap.app"],
    ["admin", "admin@achswap.app"],
  ]) {
    await seed(db, email, id, "A question", {
      replyTo: [{ address: "reply@example.net" }],
    });
    const row = await prepareSend(db, asif, {
      requestId: crypto.randomUUID(),
      replyTo: `m-${id}`,
      message: "Thanks.",
    });
    assert.equal(row.from_email, email);
    assert.equal(row.conversation_id, id);
    assert.equal(row.in_reply_to, `<${id}@example.net>`);
    assert.equal(JSON.parse(row.to_header)[0].address, "reply@example.net");
    assert.equal(row.subject, "Re: A question");
  }
  await assert.rejects(
    prepareSend(db, asif, {
      requestId: crypto.randomUUID(),
      replyTo: "m-mine",
      from: "support@achswap.app",
      message: "x",
    }),
    { status: 403 },
  );
});
test("forged sender, recipients and cross-user reply/retry are rejected", async () => {
  await seed(db, john.email, "private");
  await assert.rejects(prepareSend(db, asif, input({ from: john.email })), {
    status: 403,
  });
  await assert.rejects(
    prepareSend(db, asif, {
      requestId: crypto.randomUUID(),
      replyTo: "m-private",
      message: "x",
    }),
    { status: 404 },
  );
  await assert.rejects(
    prepareSend(
      db,
      asif,
      input({ to: "victim@example.net\r\nBcc: other@example.net" }),
    ),
    { status: 400 },
  );
  const row = await prepareSend(db, john, input({ from: john.email }));
  await assert.rejects(deliver(db, asif, row.id), { status: 404 });
});
test("prepare retries are unique and changed payloads conflict", async () => {
  const request = input();
  const a = await prepareSend(db, asif, request);
  const b = await prepareSend(db, asif, request);
  assert.equal(a.id, b.id);
  assert.equal(
    (await db.execute("SELECT count(*) n FROM conversations")).rows[0].n,
    1,
  );
  await assert.rejects(
    prepareSend(db, asif, { ...request, message: "different" }),
    { status: 409 },
  );
});
test("provider acceptance is saved and actual Message-ID maps to the conversation", async () => {
  const row = await prepareSend(db, asif, input());
  let sends = 0;
  const provider = {
    send: async () => {
      sends++;
      return { id: "provider-1" };
    },
    get: async () => ({ message_id: "<actual@resend.net>" }),
  };
  const result = await deliver(db, asif, row.id, provider);
  await deliver(db, asif, row.id, provider);
  assert.equal(sends, 1);
  assert.equal(result.status, "sent");
  assert.equal(
    (await db.execute("SELECT message_id FROM messages")).rows[0].message_id,
    "<actual@resend.net>",
  );
  assert.equal(
    (await listConversations(db, asif, { view: "sent" })).conversations.length,
    1,
  );
});
test("pending survives provider failure and metadata retry never sends again", async () => {
  const row = await prepareSend(db, asif, input());
  await assert.rejects(
    deliver(db, asif, row.id, {
      send: async () => {
        throw new Error("offline");
      },
    }),
    { status: 502 },
  );
  assert.equal(
    (await db.execute("SELECT delivery_status FROM messages")).rows[0]
      .delivery_status,
    "pending",
  );
  let sends = 0;
  const provider = {
    send: async () => {
      sends++;
      return { id: "p" };
    },
    get: async () => {
      throw new Error("offline");
    },
  };
  assert.equal(
    (await deliver(db, asif, row.id, provider)).threadingPending,
    true,
  );
  provider.get = async () => ({ message_id: "<real@resend.net>" });
  await deliver(db, asif, row.id, provider);
  assert.equal(sends, 1);
});
test("retries stop before provider idempotency expires", async () => {
  const row = await prepareSend(db, asif, input());
  await db.execute({
    sql: "UPDATE messages SET send_started_at=? WHERE id=?",
    args: ["2020-01-01T00:00:00Z", row.id],
  });
  await assert.rejects(
    deliver(db, asif, row.id, {
      send: async () => {
        throw new Error("must not send");
      },
    }),
    { status: 409 },
  );
});
test("late provider ID merges an already arrived reply without losing messages", async () => {
  const row = await prepareSend(db, asif, input());
  await seed(db, asif.email, "early");
  await db.execute({
    sql: "INSERT INTO thread_message_ids VALUES (?,?,?)",
    args: [asif.email, "<actual@resend.net>", "early"],
  });
  await deliver(db, asif, row.id, {
    send: async () => ({ id: "p" }),
    get: async () => ({ message_id: "<actual@resend.net>" }),
  });
  assert.equal(
    (await db.execute("SELECT count(*) n FROM conversations")).rows[0].n,
    1,
  );
  assert.equal(
    (await getConversation(db, asif, row.conversation_id)).messages.length,
    2,
  );
});
test("HTML-only mail returns safe text without executable HTML or remote resources", async () => {
  await seed(db, asif.email, "html", "Hello", {
    text: "",
    html: '<script>alert(1)</script><p>Safe text</p><img src="https://tracker.example/open"><a href="javascript:alert(1)">link</a>',
  });
  const message = (await getConversation(db, asif, "html")).messages[0];
  assert.equal(message.html_body, undefined);
  assert.match(message.display_text, /Safe text/);
  assert.doesNotMatch(message.display_text, /script|tracker|javascript/);
});
test("migration preserves existing inbound rows, attachment references, and is rerunnable", async () => {
  const legacy = createClient({ url: ":memory:" });
  try {
    await legacy.executeMultiple(
      await readFile(
        new URL("../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    await legacy.execute(
      "INSERT INTO conversations VALUES ('c','support','support@achswap.app','Legacy','2026','2026')",
    );
    await legacy.execute(
      "INSERT INTO messages (id,conversation_id,inbox_address,dedupe_key,envelope_from,to_email,to_header,cc,subject,received_at,created_at) VALUES ('m','c','support@achswap.app','old','a@b.net','support@achswap.app','[]','[]','Legacy','2026','2026')",
    );
    await legacy.execute(
      "INSERT INTO attachments VALUES ('a','m',0,'file.txt','text/plain',null,null,2,'hash','not_stored',null)",
    );
    await migrate(legacy);
    await migrate(legacy);
    assert.equal(
      (await legacy.execute("SELECT count(*) n FROM attachments")).rows[0].n,
      1,
    );
    assert.equal(
      (await legacy.execute("PRAGMA foreign_key_check")).rows.length,
      0,
    );
  } finally {
    legacy.close();
  }
});
test("pagination and literal search work without SQL interpolation", async () => {
  for (let i = 0; i < 32; i++)
    await seed(
      db,
      asif.email,
      `page-${String(i).padStart(2, "0")}`,
      i === 0 ? "100% complete" : "Other",
    );
  const first = await listConversations(db, asif);
  assert.equal(first.conversations.length, 30);
  const second = await listConversations(db, asif, {
    cursor: first.nextCursor,
  });
  assert.equal(second.conversations.length, 2);
  assert.equal(
    (await listConversations(db, asif, { q: "100%" })).conversations.length,
    1,
  );
  assert.equal(
    (await listConversations(db, asif, { q: "' OR 1=1 --" })).conversations
      .length,
    0,
  );
});
