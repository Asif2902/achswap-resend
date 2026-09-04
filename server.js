import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { sendMail, ALLOWED_SENDERS, normalizeSender } from "./send.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/senders", (req, res) => {
  res.json({ senders: ALLOWED_SENDERS });
});

app.post("/api/send", async (req, res) => {
  try {
    const { to, subject, message, from } = req.body || {};
    if (!to || !subject || !message) {
      return res.status(400).json({ error: "Fields required: to, subject, message" });
    }
    if (from && !normalizeSender(from)) {
      return res
        .status(400)
        .json({ error: `Invalid 'from'. Allowed: ${ALLOWED_SENDERS.join(", ")}` });
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
      from: from ? normalizeSender(from) : undefined,
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
