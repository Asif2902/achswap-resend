import { requireAuth, getAllowedSendersForUser } from "../auth.js";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }
  const session = requireAuth(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
  return res
    .status(200)
    .json({ senders: getAllowedSendersForUser(session.email) });
}
