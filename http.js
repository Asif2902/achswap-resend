import crypto from "node:crypto";
import { requireAuth } from "./auth.js";
import { getDatabase } from "./db.js";
import { MailError } from "./mailbox.js";
export function authenticated(method, operation) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== method) {
      res.setHeader("Allow", method);
      return res.status(405).json({ error: "Method not allowed." });
    }
    const user = requireAuth(req);
    if (!user)
      return res.status(401).json({ error: "Please log in to continue." });
    try {
      let body = req.body || {};
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          throw new MailError(400, "Invalid JSON.");
        }
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new MailError(400, "Invalid request.");
      const result = await operation(
        getDatabase(),
        user,
        body,
        req.query || {},
      );
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof MailError)
        return res.status(error.status).json({ error: error.message });
      const incident = crypto.randomUUID();
      console.error(JSON.stringify({ event: "mail_api_failed", incident }));
      return res
        .status(503)
        .json({
          error:
            "Mailbox service is unavailable. Your send may already be saved; retry the same request.",
          incident,
        });
    }
  };
}
