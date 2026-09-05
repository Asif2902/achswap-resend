import { verifyCredentials, createSessionToken } from "../auth.js";

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }
  const { email, password } = parseBody(req) || {};
  if (!email || password === undefined) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const user = verifyCredentials(email, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  try {
    const token = createSessionToken(user.email);
    return res.status(200).json({ ok: true, token, user });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Login failed" });
  }
}
