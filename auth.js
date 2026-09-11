import "dotenv/config";
import crypto from "crypto";

// Default senders most team members get, plus their own personal address.
// e.g. asif@achswap.app -> [support, admin, asif@], but NOT sukanto@/hossain@.
// Support-restricted members (koushik@/rollins@) get [admin, own personal] only.
export const EMAIL_DOMAIN = (
  process.env.EMAIL_DOMAIN || "achswap.app"
).toLowerCase();
export const DEFAULT_SENDERS = [
  `support@${EMAIL_DOMAIN}`,
  `admin@${EMAIL_DOMAIN}`,
];

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
    if ((f === '"' && l === '"') || (f === "'" && l === "'"))
      return s.slice(1, -1);
  }
  return s;
}

// Users come ONLY from server-side env vars (never sent to the client).
// Set these in `.env` locally and in Vercel Dashboard -> Settings -> Environment Variables.
//
// Per-user inbox scope: most members get support + admin + personal.
// Koushik and Rollins get admin + personal ONLY (no support access).
// For TEAM_USERS_JSON, an entry is support-restricted when it sets
// `"allowSupport": false` (or `"support": false`), or when its optional
// `"inboxes"` list does not include `"support"`. Entries without any of
// those fields keep full support access.
function hasSupportAccess(entry) {
  if (!entry || typeof entry !== "object") return true;
  if (entry.allowSupport === false || entry.support === false) return false;
  if (Array.isArray(entry.inboxes))
    return entry.inboxes.map((v) => String(v).toLowerCase()).includes("support");
  return true;
}

export function getUsers() {
  if (process.env.TEAM_USERS_JSON) {
    try {
      const entries = JSON.parse(process.env.TEAM_USERS_JSON);
      if (!Array.isArray(entries)) return [];
      return entries
        .map((u) => ({
          email: String(u.email || "")
            .trim()
            .toLowerCase(),
          pass: String(u.password || ""),
          allowSupport: hasSupportAccess(u),
        }))
        .filter(
          (u) =>
            u.pass &&
            u.email.endsWith(`@${EMAIL_DOMAIN}`) &&
            /^[^\s@]+@[^\s@]+$/.test(u.email),
        );
    } catch {
      return [];
    }
  }
  const legacy = (
    emailEnv,
    emailDefault,
    passEnv,
    allowSupport = true,
  ) => ({
    email: (process.env[emailEnv] || emailDefault).trim().toLowerCase(),
    pass: unquote(process.env[passEnv] || ""),
    allowSupport,
  });
  const users = [
    legacy("USER_HOSSAIN_EMAIL", "hossain@achswap.app", "USER_HOSSAIN_PASS"),
    legacy("USER_SUKANTO_EMAIL", "sukanto@achswap.app", "USER_SUKANTO_PASS"),
    legacy("USER_ASIF_EMAIL", "asif@achswap.app", "USER_ASIF_PASS"),
    // Admin-only: admin inbox + personal only, no support access.
    legacy(
      "USER_KOUSHIK_EMAIL",
      "koushik@achswap.app",
      "USER_KOUSHIK_PASS",
      false,
    ),
    legacy(
      "USER_ROLLINS_EMAIL",
      "rollins@achswap.app",
      "USER_ROLLINS_PASS",
      false,
    ),
  ];
  // Drop entries with no password configured so a missing env var = disabled login.
  return users.filter(
    (u) => u.email && u.pass && u.email.endsWith(`@${EMAIL_DOMAIN}`),
  );
}

export function getAllowedSendersForUser(email) {
  const norm = String(email || "")
    .trim()
    .toLowerCase();
  const user = getUsers().find((u) => u.email === norm);
  if (!user) return [];
  // Shared addresses + own personal address only.
  // Asif can use support/admin/asif@ but never sukanto@/hossain@, etc.
  // Support-restricted members (koushik@/rollins@) get admin + personal only.
  const senders = user.allowSupport === false
    ? [`admin@${EMAIL_DOMAIN}`]
    : [...DEFAULT_SENDERS];
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
  const norm = String(email || "")
    .trim()
    .toLowerCase();
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
  if (!secret)
    throw new Error("Missing AUTH_SECRET. Set it in .env / Vercel env vars.");
  const payload = JSON.stringify({
    email: String(email).trim().toLowerCase(),
    exp: Date.now() + TOKEN_TTL_MS,
  });
  const b64 = Buffer.from(payload, "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", secret)
    .update(b64)
    .digest("base64url");
  return `${b64}.${sig}`;
}

export function verifySessionToken(token) {
  try {
    const secret = getAuthSecret();
    if (!secret || !token) return null;
    const parts = String(token).split(".");
    if (parts.length !== 2) return null;
    const [b64, sig] = parts;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(b64)
      .digest("base64url");
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
