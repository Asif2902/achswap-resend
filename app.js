import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import login from "./api/login.js";
import me from "./api/me.js";
import senders from "./api/senders.js";
import send from "./api/send.js";
import conversations from "./api/conversations.js";
import conversation from "./api/conversation.js";
import read from "./api/read.js";
import retry from "./api/retry.js";
export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
for (const [name, handler] of Object.entries({
  login,
  me,
  senders,
  send,
  conversations,
  conversation,
  read,
  retry,
}))
  app.all(`/api/${name}`, handler);
app.use(
  express.static(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "public"),
  ),
);
app.use((error, req, res, next) => {
  res
    .status(error.type === "entity.too.large" ? 413 : 400)
    .json({ error: "Invalid or oversized request." });
});
