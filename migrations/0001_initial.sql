PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  inbox_type TEXT NOT NULL CHECK (inbox_type IN ('support', 'admin', 'personal')),
  inbox_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, inbox_address)
);
CREATE INDEX IF NOT EXISTS conversations_inbox_updated
  ON conversations(inbox_address, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_type_updated
  ON conversations(inbox_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  inbox_address TEXT NOT NULL,
  message_id TEXT,
  message_id_raw TEXT,
  dedupe_key TEXT NOT NULL,
  in_reply_to TEXT,
  "references" TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction = 'inbound'),
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
  FOREIGN KEY (conversation_id, inbox_address)
    REFERENCES conversations(id, inbox_address),
  UNIQUE (inbox_address, dedupe_key)
);
-- One delivery per recipient. A global Message-ID unique key would lose CC/BCC deliveries.
CREATE UNIQUE INDEX IF NOT EXISTS messages_recipient_message_id
  ON messages(inbox_address, message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_conversation_received
  ON messages(conversation_id, received_at, id);

-- Includes referenced IDs whose actual messages have not arrived yet.
CREATE TABLE IF NOT EXISTS thread_message_ids (
  inbox_address TEXT NOT NULL,
  message_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  PRIMARY KEY (inbox_address, message_id),
  FOREIGN KEY (conversation_id, inbox_address)
    REFERENCES conversations(id, inbox_address)
);
CREATE INDEX IF NOT EXISTS thread_ids_conversation ON thread_message_ids(conversation_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_fk TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  filename TEXT,
  content_type TEXT NOT NULL,
  disposition TEXT,
  content_id TEXT,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL,
  storage_status TEXT NOT NULL CHECK (storage_status IN ('stored', 'not_stored')),
  r2_key TEXT,
  UNIQUE (message_fk, position),
  CHECK ((storage_status = 'stored' AND r2_key IS NOT NULL)
      OR (storage_status = 'not_stored' AND r2_key IS NULL))
);
COMMIT;
