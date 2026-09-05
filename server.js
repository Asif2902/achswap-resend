import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sendMail, ALLOWED_SENDERS, normalizeSender } from "./send.js";
import {
  verifyCredentials,
  createSessionToken,
  requireAuth,
  getAllowedSendersForUser,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---- Auth: passwords live ONLY in server-side .env / Vercel env vars ----
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || password === undefined) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const user = verifyCredentials(email, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  try {
    const token = createSessionToken(user.email);
    res.json({ ok: true, token, user });
  } catch (e) {
    res.status(500).json({ error: e.message || "Login failed" });
  }
});

app.get("/api/me", (req, res) => {
  const session = requireAuth(req);
  if (!session) return res.status(401).json({ error: "Unauthorized. Please log in." });
  res.json({ ok: true, user: session });
});

app.get("/api/senders", (req, res) => {
  const session = requireAuth(req);
  if (!session) return res.status(401).json({ error: "Unauthorized. Please log in." });
  res.json({ senders: getAllowedSendersForUser(session.email) });
});

app.post("/api/send", async (req, res) => {
  try {
    const session = requireAuth(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized. Please log in." });
    }
    const allowed = getAllowedSendersForUser(session.email);
    const { to, subject, message, from } = req.body || {};
    if (!to || !subject || !message) {
      return res.status(400).json({ error: "Fields required: to, subject, message" });
    }
    const sender = from ? normalizeSender(from) : ALLOWED_SENDERS[0];
    if (!sender) {
      return res
        .status(400)
        .json({ error: `Invalid 'from'. Allowed: ${ALLOWED_SENDERS.join(", ")}` });
    }
    // Per-user enforcement: this user may only send from their own allowed list
    // (support + admin by default — no personal addresses yet).
    if (!allowed.includes(sender)) {
      return res
        .status(403)
        .json({ error: `Not allowed to send from '${sender}'. Allowed: ${allowed.join(", ")}` });
    }
    // basic email check
    const list = Array.isArray(to) ? to : String(to).split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.length || !list.every((e) => /.+@.+\..+/.test(e))) {
      return res.status(400).json({ error: "Invalid 'to' email address." });
    }
    const data = await sendMail({
      to: list,
      subject: String(subject),
      message: String(message),
      from: sender,
    });
    res.json({ ok: true, id: data?.id, data });
  } catch (e) {
    res.status(500).json({ error: e.message || "Send failed" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ AchSwap mailer running: http://localhost:${PORT}`);
  console.log(`   From options: ${ALLOWED_SENDERS.join(", ")}`);
});
