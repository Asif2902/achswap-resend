import "dotenv/config";
import crypto from "crypto";

// Default senders every team member gets, plus their own personal address.
// e.g. asif@achswap.app -> [support, admin, asif@], but NOT sukanto@/hossain@.
export const DEFAULT_SENDERS = ["support@achswap.app", "admin@achswap.app"];

export function getAuthSecret() {
  return process.env.AUTH_SECRET || "";
}

// Strip surrounding single/double quotes (dotenv needs quotes when the
// password contains `#`, but Vercel dashboard values must NOT include them).
function unquote(v) {
  const s = String(v ?? "");
  if (s.length >= 2) {
    const f = s[0];
    const l = s[s.length - 1];
    if ((f === '"' && l === '"') || (f === "'" && l === "'")) return s.slice(1, -1);
  }
  return s;
}

// Users come ONLY from server-side env vars (never sent to the client).
// Set these in `.env` locally and in Vercel Dashboard -> Settings -> Environment Variables.
export function getUsers() {
  const users = [
    {
      email: (process.env.USER_HOSSAIN_EMAIL || "hossain@achswap.app").trim().toLowerCase(),
      pass: unquote(process.env.USER_HOSSAIN_PASS || ""),
    },
    {
      email: (process.env.USER_SUKANTO_EMAIL || "sukanto@achswap.app").trim().toLowerCase(),
      pass: unquote(process.env.USER_SUKANTO_PASS || ""),
    },
    {
      email: (process.env.USER_ASIF_EMAIL || "asif@achswap.app").trim().toLowerCase(),
      pass: unquote(process.env.USER_ASIF_PASS || ""),
    },
  ];
  // Drop entries with no password configured so a missing env var = disabled login.
  return users.filter((u) => u.email && u.pass);
}

export function getAllowedSendersForUser(email) {
  const norm = String(email || "").trim().toLowerCase();
  const users = getUsers().map((u) => u.email);
  if (!users.includes(norm)) return [];
  // Shared addresses + own personal address only.
  // Asif can use support/admin/asif@ but never sukanto@/hossain@, etc.
  const senders = [...DEFAULT_SENDERS];
  if (!senders.includes(norm)) senders.push(norm);
  return senders;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyCredentials(email, password) {
  const norm = String(email || "").trim().toLowerCase();
  const user = getUsers().find((u) => safeEqual(u.email, norm));
  if (!user) return null;
  if (!safeEqual(user.pass, String(password ?? ""))) return null;
  return { email: user.email, senders: getAllowedSendersForUser(user.email) };
}

// ---- Stateless signed session token (works on Vercel serverless) ----
// Format: base64url(payload) + "." + base64url(signature)
// payload = JSON { email, exp } ; signature = HMAC-SHA256(payload, AUTH_SECRET)
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSessionToken(email) {
  const secret = getAuthSecret();
  if (!secret) throw new Error("Missing AUTH_SECRET. Set it in .env / Vercel env vars.");
  const payload = JSON.stringify({
    email: String(email).trim().toLowerCase(),
    exp: Date.now() + TOKEN_TTL_MS,
  });
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export function verifySessionToken(token) {
  try {
    const secret = getAuthSecret();
    if (!secret || !token) return null;
    const parts = String(token).split(".");
    if (parts.length !== 2) return null;
    const [b64, sig] = parts;
    const expected = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (!payload.email || !payload.exp || Date.now() > payload.exp) return null;
    const email = String(payload.email).trim().toLowerCase();
    // Token is only valid if the user still exists in env.
    if (!getUsers().some((u) => u.email === email)) return null;
    return { email, senders: getAllowedSendersForUser(email) };
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  // Express: req.headers.authorization | Vercel: req.headers.authorization
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function requireAuth(req) {
  const session = verifySessionToken(getBearerToken(req));
  return session; // null = unauthorized
}
