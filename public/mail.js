const $ = (selector) => document.querySelector(selector);
const state = {
  user: null,
  inbox: "all",
  view: "all",
  q: "",
  items: [],
  cursor: null,
  thread: null,
  messages: [],
  older: null,
  listVersion: 0,
  threadVersion: 0,
  replyDraft: null,
  composeRequest: null,
  composePreviewing: false,
};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `/img/mail-icons.svg#${name}`);
  svg.append(use);
  return svg;
}
const token = () => sessionStorage.getItem("achswap_token") || "";
// Migrate the existing login once; keep subsequent sessions scoped to this tab.
if (!token() && localStorage.getItem("achswap_token")) {
  sessionStorage.setItem(
    "achswap_token",
    localStorage.getItem("achswap_token"),
  );
  localStorage.removeItem("achswap_token");
}
async function api(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (response.status === 401) {
    logout();
    throw new Error("Your session expired. Please sign in again.");
  }
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "Something went wrong. Please try again."),
      { status: response.status },
    );
  return data;
}
function notify(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($("#toast").hidden = true), 5000);
}
function initials(value) {
  return (value || "?")
    .split(/[\s@._-]+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}
function time(value, long = false) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : new Intl.DateTimeFormat(
        undefined,
        long
          ? {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }
          : { month: "short", day: "numeric" },
      ).format(date);
}
function inboxName(type) {
  return (
    {
      personal: "Personal",
      support: "Support",
      admin: "Admin",
      all: "All mail",
    }[type] || type
  );
}
function addressText(list) {
  return (list || [])
    .flatMap((a) => a.group || [a])
    .map((a) => a.address)
    .filter(Boolean)
    .join(", ");
}
function editorText(node) {
  return String(node?.innerText || "").replace(/\u00a0/g, " ").trim();
}
function editorHtml(node) {
  return String(node?.innerHTML || "").trim();
}
function editorHasContent(node) {
  return editorText(node).length > 0;
}
function setEditorEmpty(node) {
  node.classList.toggle("is-empty", !editorHasContent(node));
}
function setEditorHtml(node, html) {
  node.innerHTML = html || "";
  setEditorEmpty(node);
}
function validateAddresses(value, required) {
  const parsed = window.EmailRender.parseAddressField(value);
  if (parsed.invalid.length)
    throw new Error(
      `Enter valid email addresses (${parsed.invalid.join(", ")}).`,
    );
  if (required && !parsed.list.length)
    throw new Error("Enter at least one recipient.");
  return parsed.list.join(", ");
}
function fillToolbar(toolbar, editor) {
  toolbar.replaceChildren();
  const actions = [
    ["bold", "B", "Bold"],
    ["italic", "I", "Italic"],
    ["underline", "U", "Underline"],
    ["insertUnorderedList", "•", "Bulleted list"],
    ["insertOrderedList", "1.", "Numbered list"],
    ["formatBlock:blockquote", "“", "Quote"],
    ["createLink", "Link", "Insert link"],
    ["insertImage", "Image", "Insert image"],
    ["insertHorizontalRule", "—", "Divider"],
  ];
  for (const [command, label, title] of actions) {
    const button = el("button", "", label);
    button.type = "button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      editor.focus();
      if (command === "createLink") {
        const url = window.prompt("Link URL");
        const href = window.EmailRender.safeHref(url);
        if (!href) return;
        document.execCommand("createLink", false, href);
        return;
      }
      if (command === "insertImage") {
        const url = window.prompt("Image URL");
        if (!url || !window.EmailRender.safeResourceUrl(url, "img")) return;
        const src = window.EmailRender.normalizeUrl(url);
        document.execCommand(
          "insertHTML",
          false,
          `<img src="${window.EmailRender.escapeHtml(src)}" alt="">`,
        );
        return;
      }
      if (command.startsWith("formatBlock:")) {
        document.execCommand("formatBlock", false, command.split(":")[1]);
        return;
      }
      document.execCommand(command, false);
    });
    toolbar.append(button);
  }
}
function bindEditor(editor) {
  setEditorEmpty(editor);
  editor.addEventListener("input", () => setEditorEmpty(editor));
  editor.addEventListener("paste", (event) => {
    const html = event.clipboardData?.getData("text/html");
    const text = event.clipboardData?.getData("text/plain") || "";
    event.preventDefault();
    const safe = html
      ? window.EmailRender.sanitizeEmailHtml(html)
      : window.EmailRender.textToHtml(text);
    document.execCommand("insertHTML", false, safe || window.EmailRender.escapeHtml(text));
    setEditorEmpty(editor);
  });
}
function bindCopyToggle(button, row, field, onChange) {
  button.addEventListener("click", () => {
    const open = row.hidden;
    row.hidden = !open;
    button.setAttribute("aria-pressed", String(open));
    if (open) field.focus();
    else {
      field.value = "";
      onChange?.("");
    }
  });
}
function showCopyRow(button, row, value) {
  const has = Boolean(String(value || "").trim());
  row.hidden = !has;
  button.setAttribute("aria-pressed", String(has));
}
function renderHtml(host, html) {
  host.classList.add("email-frame");
  host.replaceChildren();
  window.EmailRender.renderEmail(host, html);
}
function logout() {
  sessionStorage.removeItem("achswap_token");
  state.user = null;
  state.thread = null;
  state.replyDraft = null;
  state.composeRequest = null;
  state.listVersion++;
  state.threadVersion++;
  $("#workspace").hidden = true;
  $("#login").hidden = false;
  $("#composer").close();
  $("#conversation-list").replaceChildren();
  $("#reader").replaceChildren();
  $("#compose-form").reset();
  setEditorHtml($("#compose-body"), "");
  $("#login-form").elements.password.value = "";
}
async function enter(user) {
  state.user = user;
  $("#login").hidden = true;
  $("#workspace").hidden = false;
  readerEmpty();
  $("#user-email").textContent = user.email;
  $("#user-name").textContent = user.email.split("@")[0];
  $("#avatar").textContent = initials(user.email);
  // Support-restricted members (admin + personal only) never see Support.
  const supportAddress = `support@${user.email.split("@")[1]}`;
  const canSeeSupport = (user.senders || []).includes(supportAddress);
  const supportButton = document.querySelector('[data-inbox="support"]');
  if (supportButton) supportButton.hidden = !canSeeSupport;
  if (!canSeeSupport && state.inbox === "support") {
    state.inbox = "all";
    $("#inbox-title").textContent = inboxName(state.inbox);
    document.querySelectorAll("[data-inbox]").forEach((b) => {
      const active = b.dataset.inbox === state.inbox;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }
  $("#compose-from").replaceChildren(
    ...user.senders.map((address) => {
      const option = el("option", "", address);
      option.value = address;
      return option;
    }),
  );
  await refreshList();
}
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget,
    button = form.querySelector("button");
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.elements.email.value,
        password: form.elements.password.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to sign in.");
    sessionStorage.setItem("achswap_token", data.token);
    form.elements.password.value = "";
    await enter(data.user);
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$("#logout").addEventListener("click", logout);
const mobileSignout = el("button", "icon-button mobile-signout");
mobileSignout.append(icon("logout"));
mobileSignout.setAttribute("aria-label", "Sign out");
mobileSignout.addEventListener("click", logout);
$(".toolbar-actions").append(mobileSignout);
function updateCounts(unread) {
  for (const node of document.querySelectorAll("[data-count]")) {
    const kind = node.dataset.count;
    const address =
      kind === "personal"
        ? state.user.email
        : `${kind}@${state.user.email.split("@")[1]}`;
    const count =
      kind === "all"
        ? Object.values(unread).reduce((a, b) => a + b, 0)
        : unread[address] || 0;
    node.textContent = count ? String(count) : "";
  }
}
function renderList() {
  const root = $("#conversation-list");
  root.replaceChildren();
  $("#result-count").textContent =
    `${state.items.length}${state.cursor ? "+" : ""}`;
  $("#result-count").setAttribute(
    "aria-label",
    `${state.items.length}${state.cursor ? " or more" : ""} conversations`,
  );
  if (!state.items.length) {
    root.append(
      el(
        "div",
        "empty-list",
        state.q
          ? "No conversations match your search."
          : "You’re all caught up.\nMessages will appear here when they arrive.",
      ),
    );
    return;
  }
  for (const item of state.items) {
    const button = el(
      "button",
      `conversation${item.id === state.thread?.id ? " selected" : ""}${item.unread_count ? " unread" : ""}`,
    );
    button.type = "button";
    button.dataset.id = item.id;
    button.setAttribute("aria-pressed", String(item.id === state.thread?.id));
    button.setAttribute(
      "aria-label",
      `${item.subject || "(No subject)"} — ${inboxName(item.inbox_type)}`,
    );
    const top = el("div", "row-top");
    top.append(
      el("span", "avatar", initials(item.from_name || item.from_email)),
      el(
        "span",
        "row-sender",
        item.from_name || item.from_email || "Unknown sender",
      ),
      el("span", "row-date", time(item.updated_at)),
    );
    const subject = el("div", "row-subject");
    if (item.unread_count) subject.append(el("span", "unread-dot"));
    subject.append(document.createTextNode(item.subject || "(No subject)"));
    button.append(
      top,
      subject,
      el("div", "row-preview", item.preview || "Open conversation"),
      el("span", `badge ${item.inbox_type}`, inboxName(item.inbox_type)),
    );
    if (item.message_count > 1)
      button.append(
        el("span", "message-count", `${item.message_count} messages`),
      );
    button.addEventListener("click", () => openThread(item.id));
    root.append(button);
  }
}
async function refreshList(more = false) {
  const version = ++state.listVersion;
  $("#list-error").textContent = "";
  $("#refresh").disabled = true;
  $("#load-more").disabled = true;
  const query = new URLSearchParams({
    inbox: state.inbox,
    view: state.view,
    q: state.q,
  });
  if (more && state.cursor) query.set("cursor", state.cursor);
  try {
    const data = await api(`conversations?${query}`);
    if (version !== state.listVersion) return;
    state.items = more
      ? [
          ...state.items,
          ...data.conversations.filter(
            (c) => !state.items.some((i) => i.id === c.id),
          ),
        ]
      : data.conversations;
    state.cursor = data.nextCursor;
    updateCounts(data.unread);
    renderList();
    $("#load-more").hidden = !state.cursor;
  } catch (error) {
    if (version === state.listVersion)
      $("#list-error").textContent = error.message;
  } finally {
    if (version === state.listVersion) {
      $("#refresh").disabled = false;
      $("#load-more").disabled = false;
    }
  }
}
function readerEmpty() {
  state.thread = null;
  state.messages = [];
  state.threadVersion++;
  $(".mail-layout").classList.remove("reading");
  const empty = el("div", "reader-empty");
  const symbol = el("span", "empty-symbol");
  symbol.append(icon("mail"));
  empty.append(
    symbol,
    el("h2", "", "Select a conversation"),
    el("p", "", "Read and reply to your team’s mail here."),
  );
  $("#reader").replaceChildren(empty);
}
function leaveDraft() {
  return !state.replyDraft?.dirty || window.confirm("Discard your unsent reply?");
}
for (const button of document.querySelectorAll("[data-inbox]"))
  button.addEventListener("click", () => {
    if (!leaveDraft()) return;
    state.replyDraft = null;
    state.inbox = button.dataset.inbox;
    $("#inbox-title").textContent = inboxName(state.inbox);
    document.querySelectorAll("[data-inbox]").forEach((b) => {
      b.classList.toggle("active", b === button);
      if (b === button) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    readerEmpty();
    refreshList();
  });
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
    refreshList();
  });
$("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  state.q = $("#search").value.trim();
  refreshList();
});
$("#refresh").addEventListener("click", () => {
  refreshList();
  if (state.thread && !state.replyDraft?.message) openThread(state.thread.id);
});
$("#load-more").addEventListener("click", () => refreshList(true));
async function openThread(id, older = false) {
  if (state.thread?.id !== id && state.replyDraft?.message && !leaveDraft())
    return;
  if (state.thread?.id !== id) state.replyDraft = null;
  const newSelection = state.thread?.id !== id;
  const version = ++state.threadVersion;
  try {
    const data = await api(
      `conversation?${new URLSearchParams({ id, ...(older ? { before: state.older } : {}) })}`,
    );
    if (version !== state.threadVersion) return;
    state.thread = data.conversation;
    state.messages = older
      ? [...data.messages, ...state.messages]
      : data.messages;
    state.older = data.olderCursor;
    renderThread();
    renderList();
    $(".mail-layout").classList.add("reading");
    if (newSelection) {
      $("#reader").scrollTop = 0;
      $("#reader").focus({ preventScroll: true });
    }
    await api("read", {
      messageIds: data.messages
        .filter((m) => m.direction === "inbound")
        .map((m) => m.id),
    });
    refreshList();
  } catch (error) {
    notify(error.message);
  }
}
function renderThread() {
  const reader = $("#reader");
  reader.replaceChildren();
  const header = el("header", "reader-head");
  const back = el("button", "back-button", "← Back to conversations");
  back.addEventListener("click", () => {
    $(".mail-layout").classList.remove("reading");
    [...document.querySelectorAll(".conversation")]
      .find((button) => button.dataset.id === state.thread.id)
      ?.focus({ preventScroll: true });
  });
  header.append(
    back,
    el(
      "span",
      `badge ${state.thread.inbox_type}`,
      `${inboxName(state.thread.inbox_type)} inbox`,
    ),
    el("h2", "", state.thread.subject || "(No subject)"),
    el("small", "", state.thread.inbox_address),
  );
  reader.append(header);
  const body = el("div", "thread-body");
  reader.append(body);
  if (state.older) {
    const older = el("button", "load-more", "Load earlier messages");
    older.addEventListener("click", () => openThread(state.thread.id, true));
    body.append(older);
  }
  for (const message of state.messages) {
    const card = el("article", "message-card");
    const meta = el("div", "message-meta");
    const sender = el("div");
    sender.append(
      el(
        "strong",
        "",
        message.from_name || message.from_email || "Unknown sender",
      ),
    );
    sender.append(
      el(
        "div",
        "message-addresses",
        [
          message.from_email || "",
          addressText(message.to) ? `To: ${addressText(message.to)}` : "",
          addressText(message.cc) ? `Cc: ${addressText(message.cc)}` : "",
          message.direction === "outbound" && addressText(message.bcc)
            ? `Bcc: ${addressText(message.bcc)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
    meta.append(
      el("span", "avatar", initials(message.from_name || message.from_email)),
      sender,
      el("time", "", time(message.received_at, true)),
    );
    card.append(meta);
    const designed =
      message.html_body && window.EmailRender.looksDesigned(message.html_body);
    const bodyEl = el(
      "div",
      designed ? "message-body is-html is-designed" : "message-body",
    );
    if (designed) renderHtml(bodyEl, message.html_body);
    else
      bodyEl.textContent =
        message.text_body || message.display_text || "(No text content)";
    card.append(bodyEl);
    if (message.direction === "outbound")
      card.append(
        el(
          "div",
          `message-status ${message.delivery_status}`,
          message.delivery_status === "sent"
            ? `Sent · ${message.created_by?.split("@")[0] || "Team"}${!message.message_id ? " · Thread information pending" : ""}`
            : "Send not confirmed · Saved for retry",
        ),
      );
    for (const file of message.attachments) {
      const a = el("div", "attachment");
      a.append(
        icon("attachment"),
        el("span", "", file.filename || "Unnamed attachment"),
        el(
          "small",
          "",
          `${Math.ceil(file.size_bytes / 1024)} KB · ${file.storage_status === "stored" ? "File retained" : "File not retained"}`,
        ),
      );
      card.append(a);
    }
    const actions = el("div", "message-actions");
    if (message.delivery_status !== "pending") {
      for (const [mode, name, label] of [
        ["reply", "reply", "Reply"],
        ["replyAll", "reply-all", "Reply all"],
        ["forward", "forward", "Forward"],
      ]) {
        const button = el("button", "text-button");
        button.append(icon(name), document.createTextNode(label));
        button.addEventListener("click", () => startReply(message, mode));
        actions.append(button);
      }
    }
    if (message.can_retry) {
      const retry = el(
        "button",
        "text-button",
        message.delivery_status === "sent"
          ? "Refresh thread info"
          : "Retry saved message",
      );
      retry.addEventListener("click", async () => {
        retry.disabled = true;
        try {
          await api("retry", { id: message.id });
          await openThread(state.thread.id);
          notify("Message status updated.");
        } catch (error) {
          notify(error.message);
        } finally {
          retry.disabled = false;
        }
      });
      actions.append(retry);
    }
    card.append(actions);
    body.append(card);
  }
  const slot = el("div");
  slot.id = "reply-slot";
  body.append(slot);
  renderReply();
}
function quotedText(message, mode) {
  if (mode !== "forward") return "";
  const who = message.from_name
    ? `${message.from_name} <${message.from_email || ""}>`
    : message.from_email || "";
  const body =
    message.text_body ||
    window.EmailRender.htmlToPlainText(message.html_body || "") ||
    message.display_text ||
    "";
  return `\n\n---------- Forwarded message ----------\nFrom: ${who}\nDate: ${message.received_at || ""}\nSubject: ${state.thread?.subject || message.subject || ""}\n\n${body}`;
}
function startReply(message, mode) {
  if (state.replyDraft && !leaveDraft()) return;
  const recipients = window.EmailRender.replyRecipients(
    message,
    state.thread.inbox_address,
    mode,
  );
  state.replyDraft = {
    replyTo: message.id,
    mode,
    to: addressText(recipients.to),
    cc: addressText(recipients.cc),
    bcc: "",
    subject: window.EmailRender.subjectFor(
      state.thread.subject || message.subject,
      mode,
    ),
    text: quotedText(message, mode),
    dirty: false,
    requestId: crypto.randomUUID(),
  };
  renderReply();
  $("#reply-body")?.focus();
}
function renderReply() {
  const slot = $("#reply-slot");
  if (!slot) return;
  slot.replaceChildren();
  if (!state.replyDraft) {
    const target = [...state.messages]
      .reverse()
      .find((m) => m.delivery_status !== "pending");
    if (!target) return;
    const trigger = el("button", "reply-trigger");
    trigger.type = "button";
    trigger.append(
      icon("reply"),
      el("span", "", "Reply"),
      el("small", "", `from ${state.thread.inbox_address}`),
    );
    trigger.addEventListener("click", () => startReply(target, "reply"));
    slot.append(trigger);
    return;
  }
  const target = state.messages.find((m) => m.id === state.replyDraft.replyTo);
  if (!target) {
    state.replyDraft = null;
    renderReply();
    return;
  }
  const draft = state.replyDraft;
  const form = el("form", "reply-form");
  const head = el("div", "reply-head");
  const modeLabel =
    draft.mode === "forward"
      ? "Forwarding as "
      : draft.mode === "replyAll"
        ? "Reply all as "
        : "Replying as ";
  head.append(
    document.createTextNode(modeLabel),
    el("strong", "", state.thread.inbox_address),
  );
  const modes = el("div", "reply-mode");
  for (const [mode, label] of [
    ["reply", "Reply"],
    ["replyAll", "Reply all"],
    ["forward", "Forward"],
  ]) {
    const button = el("button", mode === draft.mode ? "active" : "", label);
    button.type = "button";
    button.addEventListener("click", () => {
      if (mode === draft.mode) return;
      draft.mode = mode;
      const recipients = window.EmailRender.replyRecipients(
        target,
        state.thread.inbox_address,
        mode,
      );
      draft.to = addressText(recipients.to);
      draft.cc = addressText(recipients.cc);
      draft.bcc = "";
      draft.subject = window.EmailRender.subjectFor(
        state.thread.subject || target.subject,
        mode,
      );
      draft.text = quotedText(target, mode);
      draft.dirty = false;
      renderReply();
      $("#reply-body")?.focus();
    });
    modes.append(button);
  }
  const fields = el("div", "reply-fields");
  const toRow = el("div", "reply-to-row");
  const toLabel = el("label", "", "To");
  const toInput = el("input");
  toInput.id = "reply-to";
  toInput.value = draft.to;
  toInput.placeholder = "name@example.com";
  toInput.autocomplete = "off";
  toInput.required = true;
  toInput.addEventListener("input", () => {
    draft.to = toInput.value;
    draft.dirty = true;
  });
  toLabel.append(toInput);
  const copyToggles = el("div", "compose-copy-toggles");
  const ccToggle = el("button", "ghost-toggle", "Cc");
  const bccToggle = el("button", "ghost-toggle", "Bcc");
  ccToggle.type = "button";
  bccToggle.type = "button";
  copyToggles.append(ccToggle, bccToggle);
  toRow.append(toLabel, copyToggles);
  const ccRow = el("label");
  ccRow.id = "reply-cc-row";
  ccRow.append(document.createTextNode("Cc"));
  const ccInput = el("input");
  ccInput.id = "reply-cc";
  ccInput.value = draft.cc;
  ccInput.placeholder = "Separate addresses with commas";
  ccInput.autocomplete = "off";
  ccInput.addEventListener("input", () => {
    draft.cc = ccInput.value;
    draft.dirty = true;
  });
  ccRow.append(ccInput);
  const bccRow = el("label");
  bccRow.id = "reply-bcc-row";
  bccRow.append(document.createTextNode("Bcc"));
  const bccInput = el("input");
  bccInput.id = "reply-bcc";
  bccInput.value = draft.bcc;
  bccInput.placeholder = "Separate addresses with commas";
  bccInput.autocomplete = "off";
  bccInput.addEventListener("input", () => {
    draft.bcc = bccInput.value;
    draft.dirty = true;
  });
  bccRow.append(bccInput);
  const subjectLabel = el("label", "", "Subject");
  const subjectInput = el("input");
  subjectInput.id = "reply-subject";
  subjectInput.value = draft.subject;
  subjectInput.maxLength = 998;
  subjectInput.addEventListener("input", () => {
    draft.subject = subjectInput.value;
    draft.dirty = true;
  });
  subjectLabel.append(subjectInput);
  fields.append(toRow, ccRow, bccRow, subjectLabel);
  bindCopyToggle(ccToggle, ccRow, ccInput, (value) => {
    draft.cc = value;
    draft.dirty = true;
  });
  bindCopyToggle(bccToggle, bccRow, bccInput, (value) => {
    draft.bcc = value;
    draft.dirty = true;
  });
  showCopyRow(ccToggle, ccRow, draft.cc);
  showCopyRow(bccToggle, bccRow, draft.bcc);
  const textarea = el("textarea");
  textarea.id = "reply-body";
  textarea.placeholder = "Write a reply…";
  textarea.setAttribute("aria-label", "Reply message");
  textarea.required = true;
  textarea.maxLength = 100000;
  textarea.value = draft.text;
  textarea.disabled = !!draft.attempted;
  textarea.addEventListener("input", () => {
    draft.text = textarea.value;
    draft.dirty = true;
  });
  const error = el("p", "error");
  error.setAttribute("role", "alert");
  const footer = el("div", "reply-footer");
  const cancel = el("button", "cancel-reply", "Discard");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    if (draft.dirty && !window.confirm("Discard this reply?")) return;
    state.replyDraft = null;
    renderReply();
  });
  const send = el(
    "button",
    "primary",
    draft.attempted ? "Retry same reply ↗" : "Send reply ↗",
  );
  send.type = "submit";
  footer.append(cancel, send);
  form.append(head, modes, fields, textarea, error, footer);
  slot.append(form);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.tagName === "INPUT")
      event.preventDefault();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    send.disabled = true;
    textarea.disabled = true;
    draft.attempted = true;
    error.textContent = "";
    try {
      const to = validateAddresses(toInput.value, true);
      const cc = validateAddresses(ccInput.value, false);
      const bcc = validateAddresses(bccInput.value, false);
      const message = textarea.value.trim();
      if (!message) throw new Error("Write a message of up to 100 KB.");
      const result = await api("send", {
        replyTo: draft.replyTo,
        mode: draft.mode,
        to,
        cc,
        bcc,
        subject: subjectInput.value,
        message,
        requestId: draft.requestId,
      });
      state.replyDraft = null;
      await openThread(result.conversationId);
      notify(
        result.threadingPending
          ? "Sent. Thread information can be refreshed from this message."
          : "Reply sent and saved.",
      );
    } catch (e) {
      error.textContent = e.message;
      if (e.status === 400 || !e.status) {
        draft.attempted = false;
        draft.requestId = crypto.randomUUID();
        textarea.disabled = false;
        send.textContent = "Send reply ↗";
      } else {
        send.textContent = "Retry same reply ↗";
      }
    } finally {
      send.disabled = false;
    }
  });
}
function resetComposer() {
  $("#compose-form").reset();
  setEditorHtml($("#compose-body"), "");
  $("#compose-cc-row").hidden = true;
  $("#compose-bcc-row").hidden = true;
  $("#toggle-cc").setAttribute("aria-pressed", "false");
  $("#toggle-bcc").setAttribute("aria-pressed", "false");
  $("#compose-preview").hidden = true;
  $("#compose-body").hidden = false;
  $("#compose-toolbar").hidden = false;
  $("#compose-preview-toggle").textContent = "Preview";
  $("#compose-error").textContent = "";
  $("#compose-form button[type=submit]").textContent = "Send message";
  $("#compose-form")
    .querySelectorAll("input,select")
    .forEach((node) => (node.disabled = false));
  state.composePreviewing = false;
}
$("#compose").addEventListener("click", () => {
  if (!state.composeRequest) {
    resetComposer();
    const preferred =
      state.inbox === "support" || state.inbox === "admin"
        ? `${state.inbox}@${state.user.email.split("@")[1]}`
        : state.user.email;
    // Fall back to personal when the preferred sender is not allowed
    // (e.g. support-restricted members).
    $("#compose-from").value = (state.user.senders || []).includes(preferred)
      ? preferred
      : state.user.email;
    state.composeRequest = { requestId: crypto.randomUUID() };
  }
  $("#composer").showModal();
  $("#compose-to").focus();
});
function closeCompose() {
  if (
    (editorHasContent($("#compose-body")) || state.composeRequest?.payload) &&
    !window.confirm(
      state.composeRequest?.payload
        ? "This send may already be saved. Close and check the conversation list?"
        : "Discard this unsent message?",
    )
  )
    return;
  state.composeRequest = null;
  resetComposer();
  $("#composer").close();
  refreshList();
}
$("#close-compose").addEventListener("click", closeCompose);
$("#composer").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeCompose();
});
bindCopyToggle($("#toggle-cc"), $("#compose-cc-row"), $("#compose-cc"));
bindCopyToggle($("#toggle-bcc"), $("#compose-bcc-row"), $("#compose-bcc"));
fillToolbar($("#compose-toolbar"), $("#compose-body"));
bindEditor($("#compose-body"));
$("#compose-preview-toggle").addEventListener("click", () => {
  state.composePreviewing = !state.composePreviewing;
  const previewing = state.composePreviewing;
  $("#compose-body").hidden = previewing;
  $("#compose-toolbar").hidden = previewing;
  $("#compose-preview").hidden = !previewing;
  $("#compose-preview-toggle").textContent = previewing ? "Edit" : "Preview";
  if (previewing)
    renderHtml(
      $("#compose-preview"),
      window.EmailRender.sanitizeEmailHtml(editorHtml($("#compose-body"))),
    );
});
$("#compose-form").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.tagName === "INPUT")
    event.preventDefault();
});
$("#compose-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget,
    button = form.querySelector("[type=submit]");
  button.disabled = true;
  $("#compose-error").textContent = "";
  const request = state.composeRequest;
  try {
    if (!request.payload) {
      const to = validateAddresses($("#compose-to").value, true);
      const cc = validateAddresses($("#compose-cc").value, false);
      const bcc = validateAddresses($("#compose-bcc").value, false);
      const html = window.EmailRender.sanitizeEmailHtml(
        editorHtml($("#compose-body")),
      );
      const message = editorText($("#compose-body"));
      if (!message && !html)
        throw new Error("Write a message of up to 100 KB.");
      request.payload = {
        requestId: request.requestId,
        from: $("#compose-from").value,
        to,
        cc,
        bcc,
        subject: $("#compose-subject").value,
        message,
        html,
      };
    }
    form.querySelectorAll("input,select").forEach((node) => (node.disabled = true));
    const result = await api("send", request.payload);
    state.composeRequest = null;
    resetComposer();
    $("#composer").close();
    await refreshList();
    await openThread(result.conversationId);
    notify("Message sent and saved.");
  } catch (error) {
    $("#compose-error").textContent = error.message;
    if (error.status === 400 || !error.status) {
      state.composeRequest = { requestId: crypto.randomUUID() };
      form
        .querySelectorAll("input,select")
        .forEach((node) => (node.disabled = false));
      button.textContent = "Send message";
    } else {
      button.textContent = "Retry same message ↗";
    }
  } finally {
    button.disabled = false;
  }
});
window.addEventListener("beforeunload", (event) => {
  if (state.replyDraft?.dirty || editorHasContent($("#compose-body"))) {
    event.preventDefault();
    event.returnValue = "";
  }
});
if (token())
  api("me")
    .then((data) => enter(data.user))
    .catch((error) => {
      logout();
      $("#login-error").textContent = error.message;
    });
