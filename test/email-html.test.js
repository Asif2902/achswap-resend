import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeEmailHtml,
  classifyAnchor,
  replyRecipients,
  subjectFor,
  textToHtml,
  htmlToPlainText,
} from "../email-html.js";
import { buildSendPayload } from "../provider.js";

test("sanitizer keeps email layout, buttons, linked images and safe CSS", () => {
  const html = sanitizeEmailHtml(`
    <html><head><style>
      .cta { background:#003579; color:#fff; padding:12px 20px; display:inline-block; border-radius:8px; text-decoration:none; }
      .evil { background: url(javascript:alert(1)); }
    </style></head>
    <body>
      <script>alert(1)</script>
      <h1 style="color:#003579;font-size:22px">Hello</h1>
      <p>A <a href="https://achswap.app">normal link</a> and a
        <a class="cta" href="https://achswap.app/start">Get started</a></p>
      <p><a href="https://achswap.app"><img src="https://cdn.example/logo.png" width="120" height="40" alt="Logo"></a></p>
      <table width="100%" style="background:#f4f6f8;padding:16px;border-radius:8px"><tr><td>Footer</td></tr></table>
      <img src="https://tracker.example/open.gif" width="1" height="1" alt="">
      <a href="javascript:alert(1)">xss</a>
    </body></html>
  `);
  assert.match(html, /<h1 style="color: #003579; font-size: 22px">Hello<\/h1>/);
  assert.match(html, /data-email-role="link"/);
  assert.match(html, /data-email-role="button"/);
  assert.match(html, /data-email-role="linked-image"/);
  assert.match(html, /https:\/\/cdn.example\/logo.png/);
  assert.match(html, /https:\/\/tracker.example\/open.gif/);
  assert.match(html, /background: #f4f6f8/);
  assert.match(html, /border-radius: 8px/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /alert\(1\)/);
  assert.match(html, /Get started/);
});

test("inline CTA without a button class is still a button", () => {
  const html = sanitizeEmailHtml(
    `<a href="https://achswap.app" style="display:inline-block;background:#003579;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none">Continue</a>`,
  );
  assert.match(html, /data-email-role="button"/);
  assert.match(html, /background: #003579/);
  assert.match(html, /padding: 12px 24px/);
});

test("classifyAnchor distinguishes roles", () => {
  assert.equal(
    classifyAnchor(
      {
        href: "https://x",
        style: "display:inline-block;background:#00f;padding:12px",
      },
      [{ type: "text", data: "Go" }],
    ),
    "button",
  );
  assert.equal(
    classifyAnchor({ href: "https://x" }, [
      { type: "tag", name: "img", attribs: { src: "https://x/a.png" } },
    ]),
    "linked-image",
  );
  assert.equal(
    classifyAnchor({ href: "https://x" }, [{ type: "text", data: "docs" }]),
    "link",
  );
});

test("reply all omits the current inbox and keeps CC", () => {
  const parent = {
    direction: "inbound",
    from_email: "jane@example.net",
    from_name: "Jane",
    to: [
      { address: "support@achswap.app" },
      { address: "other@example.net" },
    ],
    cc: [{ address: "cc@example.net" }, { address: "support@achswap.app" }],
    reply_to: [],
  };
  const result = replyRecipients(parent, "support@achswap.app", "replyAll");
  assert.deepEqual(
    result.to.map((a) => a.address),
    ["jane@example.net", "other@example.net"],
  );
  assert.deepEqual(
    result.cc.map((a) => a.address),
    ["cc@example.net"],
  );
  assert.deepEqual(
    replyRecipients(parent, "support@achswap.app", "reply").to.map(
      (a) => a.address,
    ),
    ["jane@example.net"],
  );
  assert.deepEqual(replyRecipients(parent, "support@achswap.app", "forward").to, []);
  assert.equal(subjectFor("Hello", "forward"), "Fwd: Hello");
});

test("provider payload includes html, cc and bcc and omits empty copies", () => {
  const payload = buildSendPayload({
    from_email: "asif@achswap.app",
    to_header: JSON.stringify([{ address: "a@example.net" }]),
    cc: JSON.stringify([{ address: "cc@example.net" }]),
    bcc: JSON.stringify([{ address: "bcc@example.net" }]),
    subject: "Hi",
    text_body: "Hello",
    html_body: "<p>Hello</p>",
  });
  assert.deepEqual(payload.cc, ["cc@example.net"]);
  assert.deepEqual(payload.bcc, ["bcc@example.net"]);
  assert.equal(payload.html, "<p>Hello</p>");
  const plain = buildSendPayload({
    from_email: "asif@achswap.app",
    to_header: JSON.stringify([{ address: "a@example.net" }]),
    cc: "[]",
    bcc: "[]",
    subject: "Hi",
    text_body: "Hello",
    html_body: null,
  });
  assert.equal("cc" in plain, false);
  assert.equal("bcc" in plain, false);
  assert.equal("html" in plain, false);
});

test("text to html round-trips line breaks without executing markup", () => {
  const html = textToHtml(`Hello <b>team</b>\nNext`);
  assert.match(html, /Hello &lt;b&gt;team&lt;\/b&gt;<br>Next/);
  assert.equal(htmlToPlainText("<p>Safe <strong>text</strong></p>"), "Safe text");
});

test("preserves body background, media queries and protocol-relative images", () => {
  const html = sanitizeEmailHtml(`
    <html><head><style>
      body { background:#f4f6f8; margin:0; }
      @media only screen and (max-width: 600px) {
        .wrap { width:100% !important; }
      }
    </style></head>
    <body bgcolor="#f4f6f8">
      <img src="//cdn.example/logo.png" alt="Logo">
      <img src="data:image/svg+xml;base64,PHN2Zy8+" alt="xss">
    </body></html>
  `);
  assert.match(html, /email-canvas/);
  assert.match(html, /bgcolor="#f4f6f8"/);
  assert.match(html, /body \{ background: #f4f6f8/);
  assert.match(html, /@media only screen and \(max-width: 600px\)/);
  assert.match(html, /width: 100% !important/);
  assert.match(html, /https:\/\/cdn.example\/logo.png/);
  assert.doesNotMatch(html, /data:image\/svg\+xml/);
});

test("bulletproof table button keeps cell paint and link padding", () => {
  const html = sanitizeEmailHtml(`
    <table border="0" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" bgcolor="#2b6cb0" style="border-radius:6px;">
          <a href="https://achswap.app/go" style="display:inline-block;padding:12px 24px;font-weight:700;color:#ffffff;text-decoration:none">Confirm account</a>
        </td>
      </tr>
    </table>
  `);
  assert.match(html, /bgcolor="#2b6cb0"/);
  assert.match(html, /padding: 12px 24px/);
  assert.match(html, /color: #ffffff/);
  assert.match(html, /text-decoration: none/);
  assert.match(html, /<a /);
  assert.doesNotMatch(html, /box-sizing/);
});
test("table-cell CTA with bgcolor is a button and stays an anchor", () => {
  const html = sanitizeEmailHtml(
    `<table><tr><td bgcolor="#003579" style="border-radius:6px"><a href="https://achswap.app/go" style="display:inline-block;padding:12px 24px;color:#ffffff;text-decoration:none">Confirm</a></td></tr></table>`,
  );
  assert.match(html, /<a /);
  assert.match(html, /data-email-role="button"/);
  assert.match(html, /padding: 12px 24px/);
  assert.match(html, /bgcolor="#003579"/);
});
