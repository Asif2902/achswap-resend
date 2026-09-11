-- Additive recipient column for outbound BCC. Safe to re-run via schema_migrations.
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
ALTER TABLE messages ADD COLUMN bcc TEXT NOT NULL DEFAULT '[]';
INSERT INTO schema_migrations VALUES ('0003_bcc', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
