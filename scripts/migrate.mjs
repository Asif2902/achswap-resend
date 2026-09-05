import "dotenv/config";
import { readFile } from "node:fs/promises";
import { getDatabase } from "../db.js";
export async function migrate(db) {
  const base = await readFile(
    new URL("../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  await db.executeMultiple(base);
  const columns = (await db.execute("PRAGMA table_info(messages)")).rows.map(
    (r) => r.name,
  );
  const versionTable = (
    await db.execute(
      "SELECT name FROM sqlite_master WHERE name='schema_migrations'",
    )
  ).rows.length;
  const installed =
    versionTable &&
    (
      await db.execute(
        "SELECT version FROM schema_migrations WHERE version='0002_mailbox'",
      )
    ).rows.length;
  if (!installed) {
    if (columns.includes("delivery_status"))
      throw new Error("Unknown schema version; inspect before migrating.");
    await db.executeMultiple(
      await readFile(
        new URL("../migrations/0002_mailbox.sql", import.meta.url),
        "utf8",
      ),
    );
  }
  if ((await db.execute("PRAGMA foreign_key_check")).rows.length)
    throw new Error("Foreign key check failed");
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/migrate.mjs")) {
  const db = getDatabase();
  try {
    await migrate(db);
    console.log("Mailbox migrations applied; foreign keys verified.");
  } catch {
    console.error(
      "Migration failed. Check configuration and schema; no credential details logged.",
    );
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
