import "dotenv/config";
import { createClient } from "@libsql/client";
let client;
export function getDatabase() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url || (!process.env.TURSO_AUTH_TOKEN && !url.startsWith("file:")))
    throw new Error("Database is not configured");
  if (
    process.env.NODE_ENV === "production" &&
    !/^(libsql|https):\/\//.test(url)
  )
    throw new Error("Remote database required");
  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
  });
  return client;
}
