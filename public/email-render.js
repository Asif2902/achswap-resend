(() => {
  const ALLOWED_TAGS = new Set([
    "A",
    "ABBR",
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "B",
    "BDI",
    "BDO",
    "BIG",
    "BLOCKQUOTE",
    "BR",
    "BUTTON",
    "CAPTION",
    "CENTER",
    "CITE",
    "CODE",
    "COL",
    "COLGROUP",
    "DD",
    "DEL",
    "DETAILS",
    "DFN",
    "DIV",
    "DL",
    "DT",
    "EM",
    "FIGCAPTION",
    "FIGURE",
    "FONT",
    "FOOTER",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "I",
    "IMG",
    "INS",
    "KBD",
    "LI",
    "MAIN",
    "MARK",
    "NAV",
    "OL",
    "P",
    "PRE",
    "Q",
    "S",
    "SAMP",
    "SECTION",
    "SMALL",
    "SPAN",
    "STRONG",
    "STYLE",
    "SUB",
    "SUMMARY",
    "SUP",
    "TABLE",
    "TBODY",
    "TD",
    "TFOOT",
    "TH",
    "THEAD",
    "TIME",
    "TR",
    "TT",
    "U",
    "UL",
    "VAR",
  ]);
  const ALLOWED_CSS = new Set([
    "background",
    "background-color",
    "background-image",
    "background-position",
    "background-repeat",
    "background-size",
    "align-content",
    "align-items",
    "align-self",
    "border",
    "border-bottom",
    "border-bottom-color",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "border-bottom-style",
    "border-bottom-width",
    "border-collapse",
    "border-color",
    "border-left",
    "border-left-color",
    "border-left-style",
    "border-left-width",
    "border-radius",
    "border-right",
    "border-right-color",
    "border-right-style",
    "border-right-width",
    "border-spacing",
    "border-style",
    "border-top",
    "border-top-color",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-top-style",
    "border-top-width",
    "border-width",
    "box-shadow",
    "box-sizing",
    "caption-side",
    "clear",
    "color",
    "column-gap",
    "direction",
    "display",
    "flex",
    "flex-basis",
    "flex-direction",
    "flex-flow",
    "flex-grow",
    "flex-shrink",
    "flex-wrap",
    "float",
    "font",
    "font-family",
    "font-size",
    "font-style",
    "font-variant",
    "font-weight",
    "gap",
    "height",
    "justify-content",
    "left",
    "letter-spacing",
    "line-height",
    "list-style",
    "list-style-position",
    "list-style-type",
    "margin",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "margin-top",
    "max-height",
    "max-width",
    "min-height",
    "min-width",
    "object-fit",
    "object-position",
    "opacity",
    "order",
    "outline",
    "outline-offset",
    "overflow",
    "overflow-wrap",
    "overflow-x",
    "overflow-y",
    "padding",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "padding-top",
    "position",
    "right",
    "row-gap",
    "table-layout",
    "text-align",
    "text-decoration",
    "text-indent",
    "text-overflow",
    "text-shadow",
    "text-transform",
    "top",
    "vertical-align",
    "visibility",
    "white-space",
    "width",
    "word-break",
    "word-spacing",
    "word-wrap",
    "z-index",
  ]);
  const EMAIL_ADDRESS =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
  const FRAME_CSS = `
    html, body { margin: 0; padding: 0; background: #fff; color: #222; }
    img { max-width: 100%; }
  `;

  function parseStyle(style) {
    const map = {};
    for (const chunk of String(style || "").split(";")) {
      const index = chunk.indexOf(":");
      if (index < 0) continue;
      const property = chunk.slice(0, index).trim().toLowerCase();
      const value = chunk.slice(index + 1).trim();
      if (property && value) map[property] = value;
    }
    return map;
  }

  function normalizeUrl(value) {
    const url = String(value || "").trim();
    if (/^\/\/[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}/.test(url))
      return `https:${url}`;
    return url;
  }

  function safeHref(value) {
    const href = normalizeUrl(value);
    if (!href || href.length > 2000) return null;
    if (/^(https?:|mailto:)/i.test(href) && !/^https?:\/\/javascript\b/i.test(href))
      return href;
    if (href.startsWith("#") && /^#[A-Za-z][\w:-]*$/.test(href)) return href;
    return null;
  }

  function safeResourceUrl(value, kind = "img") {
    const url = normalizeUrl(value);
    if (!url || url.length > 8000) return false;
    if (/^(https?:\/\/)/i.test(url)) return true;
    if (kind === "img" && /^cid:[^\s<>]+$/i.test(url)) return true;
    if (
      kind === "img" &&
      /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)
    )
      return true;
    if (kind === "css" && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(url))
      return true;
    return false;
  }

  function cssUrlSafe(value) {
    const urls = [
      ...String(value).matchAll(/url\s*\(\s*(['"]?)([^)'"]+)\1\s*\)/gi),
    ];
    if (!urls.length) return !/url\s*\(/i.test(value);
    return urls.every((match) => safeResourceUrl(match[2].trim(), "css"));
  }

  function propertyAllowed(property) {
    return !/^(behavior|-moz-binding|binding|accelerator)$/i.test(property);
  }

  function cssValueAllowed(property, value) {
    const trimmed = String(value || "").trim();
    if (!trimmed || trimmed.length > 800) return false;
    if (
      /javascript:|expression\s*\(|-moz-binding|behavior\s*:|@import/i.test(
        trimmed,
      )
    )
      return false;
    if (!cssUrlSafe(trimmed)) return false;
    if (property === "position" && !/^(static|relative)\b/i.test(trimmed))
      return false;
    return true;
  }

  function sanitizeStyleAttribute(style) {
    const declarations = [];
    for (const [property, value] of Object.entries(parseStyle(style))) {
      if (propertyAllowed(property) && cssValueAllowed(property, value))
        declarations.push(`${property}: ${value}`);
    }
    return declarations.join("; ");
  }

  function safeSelector(selector) {
    const value = String(selector || "").trim();
    if (!value || value.length > 800) return false;
    if (
      /javascript:|expression\s*\(|@import|<\/style|@font-face|@keyframes|@charset|@layer|@supports/i.test(
        value,
      )
    )
      return false;
    return true;
  }

  function matchingBrace(text, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function sanitizeCssRules(text) {
    const kept = [];
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const selector = text.slice(i, open).trim();
      const close = matchingBrace(text, open);
      if (close < 0) break;
      const body = text.slice(open + 1, close);
      i = close + 1;
      if (/^@media\b/i.test(selector)) {
        if (!safeSelector(selector)) continue;
        const inner = sanitizeCssRules(body);
        if (inner) kept.push(`${selector} { ${inner} }`);
        continue;
      }
      if (/^@/i.test(selector)) continue;
      if (!safeSelector(selector)) continue;
      const declarations = sanitizeStyleAttribute(body);
      if (declarations) kept.push(`${selector} { ${declarations} }`);
    }
    return kept.join("\n");
  }

  function sanitizeCssText(css) {
    let text = String(css || "")
      .replace(/<\/style/gi, "")
      .replace(/</g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@import[^;{}]*;?/gi, "");
    text = text.replace(
      /url\s*\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
      (all, quote, url) => {
        const normalized = normalizeUrl(url.trim());
        return safeResourceUrl(normalized, "css")
          ? `url(${quote}${normalized}${quote})`
          : "none";
      },
    );
    return sanitizeCssRules(text);
  }

  function isTransparent(value) {
    return (
      !value ||
      /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(value)
    );
  }

  function classifyAnchor(anchor, parent) {
    const elements = [...anchor.children];
    const hasText = [...anchor.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim(),
    );
    if (
      elements.length &&
      elements.every((node) => node.tagName === "IMG" || node.tagName === "BR") &&
      elements.some((node) => node.tagName === "IMG") &&
      !hasText
    )
      return "linked-image";
    const style = parseStyle(anchor.getAttribute("style"));
    const className = `${anchor.className || ""} ${anchor.id || ""}`;
    if (/\b(btn|button|cta|pill)\b/i.test(className)) return "button";
    const parentStyle = parseStyle(parent?.getAttribute?.("style") || "");
    const background =
      style["background-color"] ||
      style.background ||
      anchor.getAttribute("bgcolor") ||
      parentStyle["background-color"] ||
      parentStyle.background ||
      parent?.getAttribute?.("bgcolor");
    const display = String(style.display || "").toLowerCase();
    const padding =
      style.padding ||
      style["padding-top"] ||
      style["padding-left"] ||
      style["padding-right"] ||
      style["padding-bottom"];
    const boxed = /inline-block|block|inline-flex|flex/.test(display);
    if (!isTransparent(background) && (boxed || padding || style["border-radius"]))
      return "button";
    if (parent?.getAttribute?.("bgcolor") && (boxed || padding)) return "button";
    return "link";
  }

  const COPY_ATTRS = new Set([
    "href",
    "src",
    "style",
    "class",
    "id",
    "alt",
    "title",
    "width",
    "height",
    "bgcolor",
    "background",
    "align",
    "valign",
    "colspan",
    "rowspan",
    "cellpadding",
    "cellspacing",
    "border",
    "role",
    "dir",
    "lang",
    "color",
    "face",
    "size",
    "target",
    "rel",
    "type",
    "start",
    "data-email-role",
    "referrerpolicy",
    "loading",
    "decoding",
    "nowrap",
    "hspace",
    "vspace",
  ]);

  function copySafeAttributes(source, dest) {
    for (const attr of [...source.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") continue;
      if (COPY_ATTRS.has(name)) dest.setAttribute(attr.name, attr.value);
    }
    const style = sanitizeStyleAttribute(dest.getAttribute("style") || "");
    if (style) dest.setAttribute("style", style);
    else dest.removeAttribute("style");
  }

  function sanitizeInto(source, dest) {
    for (const node of [...source.childNodes]) {
      if (node.nodeType === 3) {
        dest.append(document.createTextNode(node.textContent));
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName;
      if (
        tag === "SCRIPT" ||
        tag === "IFRAME" ||
        tag === "OBJECT" ||
        tag === "EMBED" ||
        tag === "LINK" ||
        tag === "META" ||
        tag === "BASE" ||
        tag === "FORM" ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "SVG" ||
        tag === "MATH" ||
        tag === "VIDEO" ||
        tag === "AUDIO" ||
        tag === "TEMPLATE"
      )
        continue;
      if (tag === "STYLE") {
        const css = sanitizeCssText(node.textContent);
        if (!css.trim()) continue;
        const style = document.createElement("style");
        style.textContent = css;
        dest.append(style);
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        sanitizeInto(node, dest);
        continue;
      }
      const nextTag = tag === "BUTTON" ? "SPAN" : tag;
      const copy = document.createElement(nextTag.toLowerCase());
      copySafeAttributes(node, copy);
      if (nextTag === "A") {
        const href = safeHref(copy.getAttribute("href"));
        if (href) {
          copy.setAttribute("href", href);
          if (/^https?:/i.test(href)) {
            copy.setAttribute("target", "_blank");
            copy.setAttribute("rel", "noopener noreferrer nofollow");
          }
        } else copy.removeAttribute("href");
        copy.setAttribute("referrerpolicy", "no-referrer");
      }
      if (nextTag === "IMG") {
        const src = normalizeUrl(copy.getAttribute("src"));
        if (!safeResourceUrl(src, "img")) continue;
        copy.setAttribute("src", src);
        copy.setAttribute("referrerpolicy", "no-referrer");
        copy.setAttribute("loading", "lazy");
        copy.setAttribute("decoding", "async");
        if (!copy.hasAttribute("alt")) copy.setAttribute("alt", "");
      }
      sanitizeInto(node, copy);
      if (nextTag === "A") {
        copy.setAttribute("data-email-role", classifyAnchor(copy, dest));
        if (!copy.getAttribute("href") && !copy.querySelector("img")) {
          dest.append(...copy.childNodes);
          continue;
        }
      }
      dest.append(copy);
    }
  }

  function sanitizeEmailHtml(html) {
    const raw = String(html || "");
    if (!raw.trim()) return "";
    const parsed = new DOMParser().parseFromString(raw, "text/html");
    const wrap = document.createElement("div");
    parsed.querySelectorAll("head style").forEach((style) => {
      const css = sanitizeCssText(style.textContent);
      if (css.trim()) {
        const node = document.createElement("style");
        node.textContent = css;
        wrap.append(node);
      }
    });
    const body = parsed.body;
    const presentational =
      body.getAttribute("style") ||
      body.getAttribute("bgcolor") ||
      body.getAttribute("background") ||
      body.getAttribute("width") ||
      body.getAttribute("align");
    if (presentational) {
      const canvas = document.createElement("div");
      canvas.className = "email-canvas";
      copySafeAttributes(body, canvas);
      const existing = canvas.getAttribute("class");
      canvas.className = ["email-canvas", existing].filter(Boolean).join(" ");
      sanitizeInto(body, canvas);
      wrap.append(canvas);
    } else {
      sanitizeInto(body, wrap);
    }
    return wrap.innerHTML;
  }

  function sizeFrame(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const height = Math.max(
        doc.body ? doc.body.scrollHeight : 0,
        doc.documentElement ? doc.documentElement.scrollHeight : 0,
        40,
      );
      iframe.style.height = `${height}px`;
    } catch {
      /* sandbox without same-origin */
    }
  }

  function renderEmail(host, html) {
    const safe = sanitizeEmailHtml(html);
    const iframe = document.createElement("iframe");
    iframe.className = "email-iframe";
    iframe.title = "Email message";
    iframe.setAttribute(
      "sandbox",
      "allow-popups allow-popups-to-escape-sandbox allow-same-origin",
    );
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("scrolling", "no");
    iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>${FRAME_CSS}</style></head><body>${
      safe || "<p>This message has no HTML content.</p>"
    }</body></html>`;
    iframe.addEventListener("load", () => {
      sizeFrame(iframe);
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        doc.querySelectorAll("img").forEach((img) => {
          img.addEventListener("load", () => sizeFrame(iframe));
          img.addEventListener("error", () => {
            if (img.dataset.broken) return;
            img.dataset.broken = "1";
            img.style.outline = "1px dashed #d0d7de";
            sizeFrame(iframe);
          });
        });
      } catch {
        /* ignore */
      }
    });
    host.replaceChildren(iframe);
    return iframe;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function textToHtml(text) {
    const trimmed = String(text || "");
    if (!trimmed.trim()) return "";
    return `<div>${escapeHtml(trimmed).replace(/\r\n|\r|\n/g, "<br>")}</div>`;
  }

  function htmlToPlainText(html) {
    const node = document.createElement("div");
    node.innerHTML = sanitizeEmailHtml(html);
    return (node.innerText || "").trim();
  }

  function normalizeAddress(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function expandAddresses(list) {
    return (Array.isArray(list) ? list : [])
      .flatMap((entry) =>
        entry && Array.isArray(entry.group) ? entry.group : [entry],
      )
      .map((entry) => ({
        name: String(entry?.name || ""),
        address: normalizeAddress(entry?.address),
      }))
      .filter((entry) => entry.address);
  }

  function uniqueAddresses(list) {
    const seen = new Set();
    const result = [];
    for (const entry of list || []) {
      if (!entry?.address || seen.has(entry.address)) continue;
      seen.add(entry.address);
      result.push(entry);
    }
    return result;
  }

  function formatAddresses(list) {
    return expandAddresses(list)
      .map((entry) => entry.address)
      .join(", ");
  }

  function subjectFor(subject, mode) {
    const value = String(subject || "").trim() || "(No subject)";
    if (mode === "forward") return /^fwd:/i.test(value) ? value : `Fwd: ${value}`;
    if (mode === "reply" || mode === "replyAll")
      return /^re:/i.test(value) ? value : `Re: ${value}`;
    return value;
  }

  function replyRecipients(parent, inboxAddress, mode = "reply") {
    const inbox = normalizeAddress(inboxAddress);
    const from = parent?.from_email
      ? [
          {
            name: parent.from_name || "",
            address: normalizeAddress(parent.from_email),
          },
        ]
      : [];
    const replyTo = expandAddresses(parent?.reply_to);
    const to = expandAddresses(parent?.to);
    const cc = expandAddresses(parent?.cc);
    const sender = replyTo.length ? replyTo : from;
    if (mode === "forward") return { to: [], cc: [], bcc: [] };
    if (mode === "reply") {
      const targets =
        parent?.direction === "outbound"
          ? to.filter((entry) => entry.address !== inbox)
          : sender.filter((entry) => entry.address !== inbox);
      return {
        to: uniqueAddresses(targets.length ? targets : sender),
        cc: [],
        bcc: [],
      };
    }
    if (parent?.direction === "outbound") {
      const nextTo = uniqueAddresses(to.filter((entry) => entry.address !== inbox));
      return {
        to: nextTo.length ? nextTo : uniqueAddresses(to),
        cc: uniqueAddresses(
          cc.filter(
            (entry) =>
              entry.address !== inbox &&
              !nextTo.some((item) => item.address === entry.address),
          ),
        ),
        bcc: [],
      };
    }
    const primary = uniqueAddresses(
      sender.filter((entry) => entry.address !== inbox),
    );
    const nextTo = uniqueAddresses([
      ...primary,
      ...to.filter(
        (entry) =>
          entry.address !== inbox &&
          !primary.some((item) => item.address === entry.address),
      ),
    ]);
    return {
      to: nextTo.length ? nextTo : uniqueAddresses(sender),
      cc: uniqueAddresses(
        cc.filter(
          (entry) =>
            entry.address !== inbox &&
            !nextTo.some((item) => item.address === entry.address),
        ),
      ),
      bcc: [],
    };
  }

  function buildQuoteHtml(parent) {
    const when = parent?.received_at
      ? new Date(parent.received_at).toUTCString()
      : "";
    const who = escapeHtml(parent?.from_name || parent?.from_email || "Unknown");
    const inner = parent?.html_body
      ? sanitizeEmailHtml(parent.html_body)
      : textToHtml(parent?.text_body || parent?.display_text || "");
    return `<div class="email-quote" style="margin-top:16px;padding-top:12px;border-top:1px solid #d0d7de;"><p style="color:#656d76;font-size:13px;margin:0 0 8px;">On ${escapeHtml(when)}, ${who} wrote:</p><blockquote type="cite" style="margin:0;padding:0 0 0 12px;border-left:2px solid #d0d7de;">${inner}</blockquote></div>`;
  }

  function buildForwardHtml(parent) {
    const who = parent?.from_name
      ? `${parent.from_name} <${parent.from_email || ""}>`
      : parent?.from_email || "";
    const to = formatAddresses(parent?.to);
    const inner = parent?.html_body
      ? sanitizeEmailHtml(parent.html_body)
      : textToHtml(parent?.text_body || parent?.display_text || "");
    return `<div class="email-forward" style="margin-top:16px;padding-top:12px;border-top:1px solid #d0d7de;"><p style="color:#656d76;font-size:13px;margin:0 0 12px;">---------- Forwarded message ----------<br>From: ${escapeHtml(who)}<br>Date: ${escapeHtml(parent?.received_at || "")}<br>Subject: ${escapeHtml(parent?.subject || "")}<br>To: ${escapeHtml(to)}</p>${inner}</div>`;
  }

  function parseAddressField(value) {
    const list = String(value || "")
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const invalid = list.filter((entry) => !EMAIL_ADDRESS.test(entry));
    return { list, invalid };
  }

  window.EmailRender = {
    sanitizeEmailHtml,
    renderEmail,
    htmlToPlainText,
    textToHtml,
    escapeHtml,
    safeHref,
    safeResourceUrl,
    normalizeUrl,
    replyRecipients,
    subjectFor,
    buildQuoteHtml,
    buildForwardHtml,
    parseAddressField,
    EMAIL_ADDRESS,
  };
})();
