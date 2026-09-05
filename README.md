# AchSwap Mailer (Resend)

Simple mail sender with selectable From address. Responsive email template (mobile + PC).

From options:
- `support@achswap.app` (default)
- `admin@achswap.app`
- `sukanto@achswap.app`
- `hossain@achswap.app`
- `asif@achswap.app`

## 1. Setup

```bash
npm install
```

Put your API key in `.env`:

```
RESEND_API_KEY=re_xxxx
```

> Get key: https://resend.com/api-keys
> Make sure `support@achswap.app` domain is verified in Resend, otherwise use `onboarding@resend.dev` for testing.

## 2. Run front-end

```bash
npm start
```

Open http://localhost:3000 — pick **From**, fill **To mail / Subject / Message** → Send. Works on mobile & PC.

## 3. Deploy to Vercel (serverless)

This repo is Vercel-ready: `public/index.html` is the static frontend, `api/send.js` is the serverless function.

```bash
npm i -g vercel
vercel
```

Then in Vercel Dashboard → Project → Settings → Enviroment Variables, add:

```
RESEND_API_KEY=re_xxxx
```

API:
- `POST /api/send` with JSON `{ "from": "admin@achswap.app", "to": "customer@example.com", "subject": "...", "message": "..." }`
- `GET /api/send` → `{ "ok": true, "senders": [...] }`

> `server.js` is only for local dev (`npm start`). Vercel ignores it and uses `api/send.js`.
> Make sure all 5 sender addresses are verified in Resend (domain `achswap.app`), otherwise sends from unverified addresses will fail.
