// Isolated local test server: fake identities, in-memory database, intercepted provider.
process.env.TURSO_DATABASE_URL = "file::memory:";
process.env.TURSO_AUTH_TOKEN = "";
process.env.AUTH_SECRET = "browser-test-only-secret";
process.env.TEAM_USERS_JSON = JSON.stringify([
  { email: "asif@achswap.app", password: "test-password" },
  { email: "john@achswap.app", password: "test-password" },
]);
process.env.RESEND_API_KEY = "local-test-never-sent";
const originalFetch = globalThis.fetch;
const sent = new Map();
let sequence = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.startsWith("https://api.resend.com/")) {
    if (init.method === "POST") {
      const key = init.headers["Idempotency-Key"];
      if (!sent.has(key)) sent.set(key, { id: `test-${++sequence}` });
      return Response.json(sent.get(key));
    }
    return Response.json({
      message_id: `<${url.split("/").at(-1)}@resend.test>`,
    });
  }
  return originalFetch(input, init);
};
const { getDatabase } = await import("../db.js");
const { migrate } = await import("../scripts/migrate.mjs");
const { seed } = await import("./fixtures.js");
const db = getDatabase();
await migrate(db);
await seed(
  db,
  "support@achswap.app",
  "order",
  "A quick question about my swap",
  {
    text: "Hi AchSwap team,\n\nI submitted a swap yesterday and wanted to check on its status. The transaction is confirmed, but I’m not seeing the updated balance yet.\n\nCould you take a look when you have a moment?\n\nThanks so much,\nJane",
    date: "2026-09-02T10:30:00Z",
  },
);
await seed(
  db,
  "asif@achswap.app",
  "personal",
  "Notes for our next conversation",
  {
    text: "Hey Asif,\n\nHere are a few thoughts ahead of our call. It would be great to walk through the new experience together.\n\nTalk soon,\nAlex",
    date: "2026-09-02T09:20:00Z",
  },
);
await seed(db, "admin@achswap.app", "admin", "September workspace review", {
  text: "The monthly workspace review is ready. Please review the account settings with the team.",
  date: "2026-09-02T08:00:00Z",
});
await seed(db, "support@achswap.app", "feedback", "Loving the new experience", {
  text: "Just wanted to say the latest update feels really smooth. Keep it up!",
  date: "2026-09-01T17:45:00Z",
});
await seed(db, "support@achswap.app", "wallet", "Connecting a new wallet", {
  text: "Is it possible to connect a second wallet to my account?",
  date: "2026-09-01T14:00:00Z",
});
await seed(db, "john@achswap.app", "private", "John private note", {
  text: "This must never be visible to Asif.",
});
await seed(db, "support@achswap.app", "html", "An HTML message", {
  text: "",
  html: '<img src="https://tracker.invalid/pixel"><script>alert(1)</script><p>Hello from HTML.</p>',
  date: "2026-08-31T09:00:00Z",
});
const { app } = await import("../app.js");
app.listen(3031, "127.0.0.1", () =>
  console.log("Isolated mailbox preview: http://127.0.0.1:3031"),
);
