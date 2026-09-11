import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { convert } from "html-to-text";

const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "bdi",
  "bdo",
  "big",
  "blockquote",
  "body",
  "br",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "font",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "tt",
  "u",
  "ul",
  "var",
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

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtml(text) {
  const trimmed = String(text || "");
  if (!trimmed.trim()) return "";
  return `<div>${escapeHtml(trimmed).replace(/\r\n|\r|\n/g, "<br>")}</div>`;
}

export function htmlToPlainText(html) {
  if (!html) return "";
  return convert(String(html), {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  }).trim();
}

export function stripPreview(value) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function normalizeAddress(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function expandAddresses(list) {
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

export function uniqueAddresses(list) {
  const seen = new Set();
  const result = [];
  for (const entry of list || []) {
    if (!entry?.address || seen.has(entry.address)) continue;
    seen.add(entry.address);
    result.push(entry);
  }
  return result;
}

export function subjectFor(subject, mode) {
  const value = String(subject || "").trim() || "(No subject)";
  if (mode === "forward") return /^fwd:/i.test(value) ? value : `Fwd: ${value}`;
  if (mode === "reply" || mode === "replyAll")
    return /^re:/i.test(value) ? value : `Re: ${value}`;
  return value;
}

export function replyRecipients(parent, inboxAddress, mode = "reply") {
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

function textOf(node) {
  if (!node) return "";
  if (node.type === "text") return node.data || "";
  return (node.children || []).map(textOf).join("");
}

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

function cssUrlSafe(value) {
  const urls = [
    ...String(value).matchAll(/url\s*\(\s*(['"]?)([^)'"]+)\1\s*\)/gi),
  ];
  if (!urls.length) return !/url\s*\(/i.test(value);
  return urls.every((match) => safeResourceUrl(match[2].trim(), "css"));
}

function cssValueAllowed(property, value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.length > 800) return false;
  if (/javascript:|expression\s*\(|-moz-binding|behavior\s*:|@import/i.test(trimmed))
    return false;
  if (!cssUrlSafe(trimmed)) return false;
  if (property === "position" && !/^(static|relative)\b/i.test(trimmed))
    return false;
  return true;
}

function propertyAllowed(property) {
  return !/^(behavior|-moz-binding|binding|accelerator)$/i.test(property);
}

function safeSelector(selector) {
  const value = String(selector || "").trim();
  if (!value || value.length > 800) return false;
  if (/javascript:|expression\s*\(|@import|<\/style|@font-face|@keyframes|@charset|@layer|@supports/i.test(
    value,
  ))
    return false;
  return true;
}

function sanitizeDeclarations(body) {
  const declarations = [];
  for (const [property, value] of Object.entries(parseStyle(body))) {
    if (propertyAllowed(property) && cssValueAllowed(property, value))
      declarations.push(`${property}: ${value}`);
  }
  return declarations.join("; ");
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
    const declarations = sanitizeDeclarations(body);
    if (declarations) kept.push(`${selector} { ${declarations} }`);
  }
  return kept.join("\n");
}

export function sanitizeCssText(css) {
  let text = String(css || "")
    .replace(/<\/style/gi, "")
    .replace(/</g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;{}]*;?/gi, "");
  text = text.replace(/url\s*\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (all, quote, url) => {
    const normalized = normalizeUrl(url.trim());
    return safeResourceUrl(normalized, "css")
      ? `url(${quote}${normalized}${quote})`
      : "none";
  });
  return sanitizeCssRules(text);
}

function sanitizeStyleAttribute(style) {
  const declarations = [];
  for (const [property, value] of Object.entries(parseStyle(style))) {
    if (propertyAllowed(property) && cssValueAllowed(property, value))
      declarations.push(`${property}: ${value}`);
  }
  return declarations.join("; ");
}

export function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (/^\/\/[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}/.test(url))
    return `https:${url}`;
  return url;
}

export function safeHref(value) {
  const href = normalizeUrl(value);
  if (!href || href.length > 2000) return null;
  if (/^(https?:|mailto:)/i.test(href) && !/^https?:\/\/javascript\b/i.test(href))
    return href;
  if (href.startsWith("#") && /^#[A-Za-z][\w:-]*$/.test(href)) return href;
  return null;
}

export function safeResourceUrl(value, kind = "img") {
  const url = normalizeUrl(value);
  if (!url || url.length > 8000) return false;
  if (/^(https?:\/\/)/i.test(url)) return true;
  if (kind === "img" && /^cid:[^\s<>]+$/i.test(url)) return true;
  if (
    kind === "img" &&
    /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url) &&
    url.length <= 220000
  )
    return true;
  if (kind === "css" && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(url))
    return true;
  return false;
}

function safeTokens(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(
      (token) =>
        token &&
        token.length <= 80 &&
        !/[<>"'`=\\/]/.test(token) &&
        !/^on/i.test(token),
    )
    .slice(0, 40)
    .join(" ");
}

function safeColor(value) {
  const color = String(value || "").trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return color;
  if (/^(?:rgb|rgba|hsl|hsla)\([^)]{1,80}\)$/i.test(color)) return color;
  if (/^[a-z]{1,20}$/i.test(color)) return color;
  return null;
}

function safeSize(value) {
  const size = String(value || "").trim();
  if (/^\d{1,5}$/.test(size)) return size;
  if (/^\d{1,4}(?:\.\d{1,2})?(?:%|px|em|rem)$/i.test(size)) return size;
  return null;
}

function isTransparent(value) {
  return !value || /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(
    value,
  );
}

function significantChildren(children) {
  return (children || []).filter((child) => {
    if (child.type === "text") return String(child.data || "").trim();
    return child.type === "tag" || child.name;
  });
}

function isLinkedImage(children) {
  const nodes = significantChildren(children);
  return (
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        node.name === "img" ||
        node.name === "br" ||
        (node.type === "text" && !String(node.data || "").trim()),
    ) &&
    nodes.some((node) => node.name === "img")
  );
}

export function classifyAnchor(attribs = {}, children = [], parentStyle = {}) {
  if (isLinkedImage(children)) return "linked-image";
  const style = parseStyle(attribs.style);
  const className = `${attribs.class || ""} ${attribs.id || ""}`;
  if (/\b(btn|button|cta|pill)\b/i.test(className)) return "button";
  const display = String(style.display || "").toLowerCase();
  const padding =
    style.padding ||
    style["padding-top"] ||
    style["padding-bottom"] ||
    style["padding-left"] ||
    style["padding-right"];
  const radius = style["border-radius"];
  const background =
    style["background-color"] ||
    style.background ||
    attribs.bgcolor ||
    parentStyle["background-color"] ||
    parentStyle.background ||
    parentStyle.bgcolor;
  const hasBackground = !isTransparent(background);
  const boxed = /inline-block|block|inline-flex|flex/.test(display);
  if (hasBackground && (boxed || padding || radius)) return "button";
  if (boxed && padding && (hasBackground || radius || parentStyle.bgcolor))
    return "button";
  if (parentStyle.bgcolor && (boxed || padding)) return "button";
  return "link";
}

function sanitizeAttributes(name, attribs, children, parentStyle) {
  const output = {};
  const raw = attribs || {};
  const style = sanitizeStyleAttribute(raw.style || "");
  if (style) output.style = style;
  const className = safeTokens(raw.class);
  if (className) output.class = className;
  const id = safeTokens(raw.id).split(" ")[0];
  if (id) output.id = id;
  if (raw.title) output.title = String(raw.title).slice(0, 200);
  if (raw.lang && /^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(raw.lang))
    output.lang = raw.lang;
  if (raw.dir && /^(ltr|rtl|auto)$/i.test(raw.dir))
    output.dir = raw.dir.toLowerCase();
  if (raw.align && /^(left|right|center|justify|middle|top|bottom)$/i.test(raw.align))
    output.align = raw.align.toLowerCase();
  if (raw.valign && /^(top|middle|bottom|baseline)$/i.test(raw.valign))
    output.valign = raw.valign.toLowerCase();
  const width = safeSize(raw.width);
  const height = safeSize(raw.height);
  if (width) output.width = width;
  if (height) output.height = height;
  const bgcolor = safeColor(raw.bgcolor);
  if (bgcolor) output.bgcolor = bgcolor;
  if (raw.role && /^(presentation|none|img)$/i.test(raw.role))
    output.role = raw.role.toLowerCase();
  if (name === "a") {
    const href = safeHref(raw.href);
    if (href) {
      output.href = href;
      if (/^https?:/i.test(href)) {
        output.target = "_blank";
        output.rel = "noopener noreferrer nofollow";
      }
    }
    output["data-email-role"] = classifyAnchor(
      { ...raw, style: style || raw.style, class: className },
      children,
      parentStyle,
    );
    output.referrerpolicy = "no-referrer";
  }
  if (name === "img") {
    const src = normalizeUrl(raw.src);
    if (safeResourceUrl(src, "img")) output.src = src;
    output.alt = String(raw.alt || "").slice(0, 300);
    output.referrerpolicy = "no-referrer";
    output.loading = "lazy";
    output.decoding = "async";
    if (raw.border && /^\d{1,3}$/.test(raw.border)) output.border = raw.border;
    if (raw.hspace && /^\d{1,4}$/.test(raw.hspace)) output.hspace = raw.hspace;
    if (raw.vspace && /^\d{1,4}$/.test(raw.vspace)) output.vspace = raw.vspace;
  }
  if (name === "font") {
    const color = safeColor(raw.color);
    if (color) output.color = color;
    if (raw.face) output.face = String(raw.face).replace(/["<>]/g, "").slice(0, 80);
    if (raw.size && /^[+-]?\d$/.test(raw.size)) output.size = raw.size;
  }
  if (name === "table" || name === "td" || name === "th") {
    if (raw.cellpadding && /^\d{1,3}$/.test(raw.cellpadding))
      output.cellpadding = raw.cellpadding;
    if (raw.cellspacing && /^\d{1,3}$/.test(raw.cellspacing))
      output.cellspacing = raw.cellspacing;
    if (raw.border && /^\d{1,3}$/.test(raw.border)) output.border = raw.border;
    if (raw.colspan && /^[1-9]\d{0,2}$/.test(raw.colspan))
      output.colspan = raw.colspan;
    if (raw.rowspan && /^[1-9]\d{0,2}$/.test(raw.rowspan))
      output.rowspan = raw.rowspan;
    if (raw.background && safeResourceUrl(normalizeUrl(raw.background), "img"))
      output.background = normalizeUrl(raw.background);
    if (raw.nowrap != null && raw.nowrap !== "false") output.nowrap = "nowrap";
  }
  if ((name === "ol" || name === "li") && raw.start && /^\d{1,5}$/.test(raw.start))
    output.start = raw.start;
  if (name === "ol" || name === "ul" || name === "li") {
    if (raw.type && /^[1aAiI]$/.test(raw.type)) output.type = raw.type;
  }
  if (name === "blockquote" && raw.type === "cite") output.type = "cite";
  return output;
}

function parentContext(name, attribs, previous = {}) {
  const style = parseStyle(attribs.style);
  return {
    ...previous,
    ...style,
    bgcolor: attribs.bgcolor || previous.bgcolor,
    background: style.background || attribs.bgcolor || previous.background,
    "background-color":
      style["background-color"] || attribs.bgcolor || previous["background-color"],
  };
}

function sanitizeNode(node, parentStyle) {
  if (!node) return [];
  if (node.type === "text") return String(node.data || "") ? [node] : [];
  if (node.type === "comment" || node.type === "directive") return [];
  const name = String(node.name || "").toLowerCase();
  if (!name) return [];
  if (
    name === "script" ||
    name === "noscript" ||
    name === "iframe" ||
    name === "object" ||
    name === "embed" ||
    name === "form" ||
    name === "textarea" ||
    name === "input" ||
    name === "select" ||
    name === "button" ||
    name === "svg" ||
    name === "math" ||
    name === "video" ||
    name === "audio" ||
    name === "template" ||
    name === "link" ||
    name === "meta" ||
    name === "base" ||
    name === "applet" ||
    name === "frame" ||
    name === "frameset"
  ) {
    if (name === "button") {
      node.name = "span";
      node.attribs = {
        ...sanitizeAttributes("span", node.attribs || {}, node.children, parentStyle),
        class: ["email-button-fallback", safeTokens(node.attribs?.class)]
          .filter(Boolean)
          .join(" "),
      };
      node.children = sanitizeNodes(
        node.children || [],
        parentContext("span", node.attribs, parentStyle),
      );
      return [node];
    }
    return [];
  }
  if (name.includes(":")) return sanitizeNodes(node.children || [], parentStyle);
  if (name === "html")
    return sanitizeNodes(node.children || [], parentContext(name, node.attribs || {}, parentStyle));
  if (name === "body") {
    const children = sanitizeNodes(
      node.children || [],
      parentContext(name, node.attribs || {}, parentStyle),
    );
    const attribs = sanitizeAttributes(
      "div",
      node.attribs || {},
      children,
      parentStyle,
    );
    if (
      attribs.style ||
      attribs.bgcolor ||
      attribs.background ||
      attribs.width ||
      attribs.align
    ) {
      node.name = "div";
      node.attribs = {
        ...attribs,
        class: ["email-canvas", attribs.class].filter(Boolean).join(" "),
      };
      node.children = children;
      return [node];
    }
    return children;
  }
  if (name === "head")
    return sanitizeNodes(
      (node.children || []).filter(
        (child) => String(child.name || "").toLowerCase() === "style",
      ),
      parentStyle,
    );
  if (name === "style") {
    const css = sanitizeCssText(textOf(node));
    if (!css.trim()) return [];
    const parsed = parseDocument(`<style>${css}</style>`);
    return parsed.children.filter(
      (child) => String(child.name || "").toLowerCase() === "style",
    );
  }
  if (!ALLOWED_TAGS.has(name)) {
    return sanitizeNodes(node.children || [], parentStyle);
  }
  const children = sanitizeNodes(
    node.children || [],
    parentContext(name, node.attribs || {}, parentStyle),
  );
  if (name === "a") {
    const href = safeHref(node.attribs?.href);
    if (!href && !isLinkedImage(children) && !textOf({ children }).trim())
      return children;
  }
  if (name === "img" && !safeResourceUrl(node.attribs?.src, "img")) return [];
  node.name = name;
  node.attribs = sanitizeAttributes(name, node.attribs || {}, children, parentStyle);
  if (name === "a" && !node.attribs.href) return children;
  node.children = children;
  return [node];
}

function sanitizeNodes(nodes, parentStyle) {
  const output = [];
  for (const node of nodes || []) output.push(...sanitizeNode(node, parentStyle));
  return output;
}

export function sanitizeEmailHtml(html) {
  const raw = String(html || "");
  if (!raw.trim()) return "";
  if (Buffer.byteLength(raw) > 200000) return sanitizeEmailHtml(raw.slice(0, 180000));
  const document = parseDocument(raw, { decodeEntities: true });
  const children = sanitizeNodes(document.children, {});
  return render(children, { encodeEntities: "utf8" }).trim();
}

export function displayHtml(html) {
  const safe = sanitizeEmailHtml(html);
  return safe || "";
}

export function buildQuoteHtml(parent) {
  const when = parent?.received_at
    ? new Date(parent.received_at).toUTCString()
    : "";
  const who = escapeHtml(parent?.from_name || parent?.from_email || "Unknown");
  const inner = parent?.html_body
    ? sanitizeEmailHtml(parent.html_body)
    : textToHtml(parent?.text_body || parent?.display_text || "");
  return `<div class="email-quote" style="margin-top:16px;padding-top:12px;border-top:1px solid #d0d7de;"><p style="color:#656d76;font-size:13px;margin:0 0 8px;">On ${escapeHtml(when)}, ${who} wrote:</p><blockquote type="cite" style="margin:0;padding:0 0 0 12px;border-left:2px solid #d0d7de;">${inner}</blockquote></div>`;
}

export function buildForwardHtml(parent) {
  const who = parent?.from_name
    ? `${parent.from_name} <${parent.from_email || ""}>`
    : parent?.from_email || "";
  const to = expandAddresses(parent?.to)
    .map((entry) => entry.address)
    .join(", ");
  const inner = parent?.html_body
    ? sanitizeEmailHtml(parent.html_body)
    : textToHtml(parent?.text_body || parent?.display_text || "");
  return `<div class="email-forward" style="margin-top:16px;padding-top:12px;border-top:1px solid #d0d7de;"><p style="color:#656d76;font-size:13px;margin:0 0 12px;">---------- Forwarded message ----------<br>From: ${escapeHtml(who)}<br>Date: ${escapeHtml(parent?.received_at || "")}<br>Subject: ${escapeHtml(parent?.subject || "")}<br>To: ${escapeHtml(to)}</p>${inner}</div>`;
}

export function buildQuoteText(parent) {
  const who = parent?.from_name || parent?.from_email || "Unknown";
  const when = parent?.received_at
    ? new Date(parent.received_at).toUTCString()
    : "";
  const body = String(parent?.text_body || parent?.display_text || "")
    .split(/\r\n|\r|\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${when}, ${who} wrote:\n${body}`;
}

export { EMAIL_ADDRESS };
