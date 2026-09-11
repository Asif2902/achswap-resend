# AchSwap Mail

A team mailbox with Personal, Support and Admin filters, threaded conversations, search, per-user unread state, a Sent filter, compose and reply. The existing password login is retained. Full members can read/send shared support/admin mail and only their own personal mail; admin-only members (koushik@, rollins@) get admin plus their own personal mail with no support access; the API applies those rules to every query, send, and retry.

Incoming mail: **Cloudflare Email Routing → Email Worker → Turso**.
Outgoing mail: **authenticated app server → saved pending message in Turso → Resend → saved sent status and Message-ID**.

There is no Gmail integration, forwarding, inbox synchronization, scheduled job, polling, or background send queue. Refresh mail explicitly with the refresh button. All Turso/Resend credentials and team passwords stay on the server.

## Run with your database

Use Node.js 22+ (24 recommended).

```sh
npm ci
```

Copy `.env.example` to `.env`, then set real values:

- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`: the **same libSQL-compatible Turso database** as the inbound Worker.
- `RESEND_API_KEY`: Resend API key for verified `achswap.app` sending. Retrieving actual Message-IDs also requires permission to read sent email metadata; a sending-only key can send but cannot complete that lookup.
- `AUTH_SECRET`: a strong random session-signing secret. Keep the existing value if existing sessions should remain valid.
- Existing `USER_ASIF_*`, `USER_HOSSAIN_*`, `USER_SUKANTO_*` variables continue working. `USER_KOUSHIK_*` and `USER_ROLLINS_*` are admin-only: admin inbox + their own personal address, no support access (passwords come from `USER_KOUSHIK_PASS` / `USER_ROLLINS_PASS` in `.env` and Vercel env vars). Alternatively, `TEAM_USERS_JSON` supplies an arbitrary list of `{ "email": "member@achswap.app", "password": "..." }` objects; add `"allowSupport": false` to an entry for the same admin-only scope. When configured it replaces the legacy entries; invalid configuration fails closed.
- `EMAIL_DOMAIN=achswap.app`.

Back up your existing Turso database before the upgrade, then:

```sh
npm run migrate
npm start
```

Open [the local app](http://localhost:3000). Sign in using one of your configured team accounts. The frontend stores only its signed session token, in sessionStorage. Legacy localStorage sessions are moved to sessionStorage once.

## Database upgrade and inbound Worker

`migrations/0001_initial.sql` is the original inbound schema. `0002_mailbox.sql` rebuilds `messages` within a transaction to allow outbound rows and adds reply addresses, provider identifiers, send state, idempotency fields, and `message_reads`. It copies every original message column and preserves attachment foreign keys. Read markers belong to a message and user, so another teammate opening support mail does not mark it read for everyone.

The migration runner records `0002_mailbox`, skips it on later runs, and verifies foreign keys. **Do not run the second SQL file by itself repeatedly.** This migration targets the schema from the companion `email` project; if your live database has another layout, inspect it and adapt the migration first. No unknown production schema or historical data was silently rewritten during implementation.

The companion Worker under `C:/Users/Asif/email` has also been updated to save MIME Reply-To addresses. Its migration files match this repository. **Apply migration 0002 before deploying the updated Worker source**, then deploy the Worker:

```powershell
Set-Location C:\Users\Asif\email
npm run deploy
```

The deployed Worker from the earlier setup can still insert inbound rows after the migration; the new columns have compatible defaults. The updated source requires the new `reply_to` column. Future inbound replies find outbound provider Message-IDs through the same `thread_message_ids` mapping. The Worker can merge conversations without losing per-message read markers or outbound history.

The inbound Worker still needs valid Cloudflare secrets and an active catch-all for `achswap.app`. Its separate README explains those steps. App database credentials alone do not populate Worker secrets. Keep Cloudflare MX for incoming routing and retain Resend's required sending DNS records. Do not add competing inbound MX records for Resend receiving.

## Vercel deployment

The existing deployment structure is retained: `public/` is the UI, `api/*.js` are Vercel functions, and `server.js` is the local Express host. Both environments invoke the same mailbox services.

Set the server variables above in the existing Vercel project's environment settings, apply the database migration, and deploy the repository through its existing Git integration or Vercel CLI. Do not give secrets a public/frontend prefix. No production Vercel deployment or Git push is performed by the local test commands.

## Reply and send behavior

- Personal reply → the logged-in member's personal address. Support/admin reply → that conversation's exact shared inbox address. The server derives this from the parent message; the browser cannot substitute another sender.
- Reply targets the incoming Reply-To when provided, otherwise From. Replying to an outbound message keeps its existing To recipients. This is a normal Reply, not Reply All; CC from the original is visible but not automatically included. New messages allow explicit CC.
- Outgoing In-Reply-To and References use real email Message-IDs, with a `Re:` subject for replies. Subject alone never determines threading. Resend's [reply threading documentation](https://resend.com/docs/dashboard/receiving/reply-to-emails) describes these headers.
- The outgoing row is committed before calling the provider. Pending rows remain visible if the send fails or its result is uncertain. Sent means Resend accepted the request, **not** verified final delivery. No delivery webhook is included.
- A stable provider idempotency key is derived from the saved row ID. Browser retries reuse the same request ID and content; changed content using an old ID is rejected. Pending messages can be retried from their conversation by the author. If another teammate sees a pending shared message, its author must retry it.
- Resend keys expire after 24 hours, so this app refuses automatic retries after 23 hours from the first attempt when acceptance is unknown. Check the provider before creating another message. See [Resend idempotency behavior](https://resend.com/docs/dashboard/emails/idempotency-keys).
- After acceptance, the server fetches the [actual Message-ID](https://resend.com/docs/api-reference/emails/retrieve-email) and records its conversation relationship. A failed metadata lookup shows “Thread information pending”; **Refresh thread info** retrieves metadata without sending again. No fabricated Message-ID is used. Until reconciliation succeeds, a new reply can temporarily appear as a separate conversation; reconciliation merges the related conversation.
- Turso and Resend do not share an atomic transaction. Idempotency plus saved pending state makes retry safe within the provider window, including accepted sends whose database acknowledgement failed. There is no claim of exactly-once external delivery across indefinite outages.

## Content, attachments and permissions

Every personal read and send is authorized on the server, including direct conversation IDs, searching, read updates and retry endpoints. “All mail” means only inboxes the current member can access. Database row IDs, sender headers and search filters are not authorization.

Message text is rendered with textContent. HTML-only mail is converted to text on the server; no original HTML, scripts, external images, styles, links, or tracking pixels are inserted into the page. The app sets CSP and no-store API responses. Existing stored HTML is retained in the database for possible future sanitized rendering.

Attachment metadata is displayed. Files whose bytes were not retained say **File not retained**. R2 files say **Stored in R2**. This app does not yet expose an R2 download endpoint or attach files to outgoing messages; no public bucket links or object keys are leaked by the API.

Personal addresses are case-insensitive. Unknown personal recipients accepted by catch-all are not visible until a matching team user is configured. Plus aliases are distinct unless you explicitly introduce an alias policy. Shared support/admin access remains available to full team members, matching the existing app. Koushik and Rollins are admin-only: they see admin plus their own personal mail, and support queries/sends fail with access denied (the Support filter is hidden for them).

## Verification and safe preview

```sh
npm test
npm run check
npx playwright install chromium
npm run test:ui
```

Backend tests exercise actual SQLite/libSQL statements, schema preservation, authorization, reply selection, provider-ID reconciliation, retry boundaries, read state and search pagination. Browser tests exercise login, filters, replies, persisted sent messages, composing, mobile layout and HTML safety using a fake provider. No test sends real email.

To open the same isolated preview manually:

```sh
node test/ui-server.mjs
```

Open [the fixture preview](http://127.0.0.1:3031), sign in as `asif@achswap.app` with password `test-password`. It uses an in-memory database and intercepts Resend requests; all messages are fictional and reset when stopped. This test server is not an API route and must not be used as the production start command.

## API

All mailbox endpoints require `Authorization: Bearer <session token>`.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/login` | Existing email/password login |
| `GET /api/me`, `/api/senders` | Current identity and authorized addresses |
| `GET /api/conversations?inbox=personal&view=unread&q=...&cursor=...` | Filtered paginated list; per-address unread counts |
| `GET /api/conversation?id=...&before=...` | Authorized conversation and paginated messages |
| `POST /api/read` | Mark only supplied visible message IDs read for this user |
| `POST /api/send` | Compose with from/to/cc/subject/message/requestId, or reply with replyTo/message/requestId |
| `POST /api/retry` | Retry saved outbound row by id or refresh its pending Message-ID |

`replyTo` in the send request is the **database parent message row ID**, not a recipient string. A reply request cannot override To/CC. `requestId` is a client-generated UUID, kept unchanged for retries of that same content.
