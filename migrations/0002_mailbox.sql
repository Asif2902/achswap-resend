-- Run through scripts/migrate.mjs, with a backup before upgrading production.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;
CREATE TABLE messages_v2 (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  inbox_address TEXT NOT NULL,
  message_id TEXT,
  message_id_raw TEXT,
  dedupe_key TEXT NOT NULL,
  in_reply_to TEXT,
  "references" TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  from_email TEXT,
  from_name TEXT,
  envelope_from TEXT NOT NULL,
  to_email TEXT NOT NULL,
  to_header TEXT NOT NULL CHECK (json_valid(to_header)),
  cc TEXT NOT NULL CHECK (json_valid(cc)),
  subject TEXT NOT NULL,
  text_body TEXT,
  html_body TEXT,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reply_to TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(reply_to)),
  delivery_status TEXT NOT NULL DEFAULT 'received' CHECK (delivery_status IN ('received','pending','sent')),
  provider_id TEXT,
  created_by TEXT,
  idempotency_key TEXT,
  request_hash TEXT,
  send_started_at TEXT,
  UNIQUE (created_by, idempotency_key),
  FOREIGN KEY (conversation_id, inbox_address)
    REFERENCES conversations(id, inbox_address),
  UNIQUE (inbox_address, dedupe_key)
);
INSERT INTO messages_v2 (id, conversation_id, inbox_address, message_id, message_id_raw, dedupe_key, in_reply_to, "references", direction, from_email, from_name, envelope_from, to_email, to_header, cc, subject, text_body, html_body, received_at, created_at) SELECT id, conversation_id, inbox_address, message_id, message_id_raw, dedupe_key, in_reply_to, "references", direction, from_email, from_name, envelope_from, to_email, to_header, cc, subject, text_body, html_body, received_at, created_at FROM messages;
DROP TABLE messages;
ALTER TABLE messages_v2 RENAME TO messages;
CREATE UNIQUE INDEX messages_recipient_message_id ON messages(inbox_address,message_id) WHERE message_id IS NOT NULL;
CREATE INDEX messages_conversation_received ON messages(conversation_id,received_at,id);
CREATE INDEX messages_inbox_direction ON messages(inbox_address,direction,received_at);
CREATE TABLE message_reads (message_fk TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_email TEXT NOT NULL, PRIMARY KEY(message_fk,user_email));
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO schema_migrations VALUES ('0002_mailbox', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
PRAGMA foreign_keys = ON;
