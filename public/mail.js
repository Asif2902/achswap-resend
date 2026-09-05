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
};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
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
  $("#login-form").elements.password.value = "";
}
async function enter(user) {
  state.user = user;
  $("#login").hidden = true;
  $("#workspace").hidden = false;
  $("#user-email").textContent = user.email;
  $("#user-name").textContent = user.email.split("@")[0];
  $("#avatar").textContent = initials(user.email);
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
const mobileSignout = el("button", "icon-button mobile-signout", "↪");
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
    `${state.items.length}${state.cursor ? "+" : ""} conversations`;
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
  empty.append(
    el("span", "empty-symbol", "↗"),
    el("h2", "", "Room to focus."),
    el(
      "p",
      "",
      "Choose a conversation to read and reply.\nEverything stays in its own inbox.",
    ),
  );
  $("#reader").replaceChildren(empty);
}
function leaveDraft() {
  return (
    !state.replyDraft?.message || window.confirm("Discard your unsent reply?")
  );
}
for (const button of document.querySelectorAll("[data-inbox]"))
  button.addEventListener("click", () => {
    if (!leaveDraft()) return;
    state.replyDraft = null;
    state.inbox = button.dataset.inbox;
    $("#inbox-title").textContent = inboxName(state.inbox);
    document
      .querySelectorAll("[data-inbox]")
      .forEach((b) => b.classList.toggle("active", b === button));
    readerEmpty();
    refreshList();
  });
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => b.classList.toggle("active", b === button));
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
  back.addEventListener("click", () =>
    $(".mail-layout").classList.remove("reading"),
  );
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
        `${message.from_email || ""}\nTo: ${addressText(message.to)}${message.cc.length ? ` · CC: ${addressText(message.cc)}` : ""}`,
      ),
    );
    meta.append(
      el("span", "avatar", initials(message.from_name || message.from_email)),
      sender,
      el("time", "", time(message.received_at, true)),
    );
    card.append(
      meta,
      el(
        "div",
        "message-body",
        message.text_body || message.display_text || "(No text content)",
      ),
    );
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
        el("span", "", "⌁"),
        el("span", "", file.filename || "Unnamed attachment"),
        el(
          "small",
          "",
          `${Math.ceil(file.size_bytes / 1024)} KB · ${file.storage_status === "stored" ? "Stored in R2" : "File not retained"}`,
        ),
      );
      card.append(a);
    }
    const actions = el("div", "message-actions");
    if (message.delivery_status !== "pending") {
      const reply = el("button", "text-button", "↶ Reply");
      reply.addEventListener("click", () => {
        if (!leaveDraft()) return;
        state.replyDraft = {
          replyTo: message.id,
          message: "",
          requestId: crypto.randomUUID(),
        };
        renderReply();
        $("#reply-body").focus();
      });
      actions.append(reply);
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
      el("span", "reply-trigger-icon", "↩"),
      el("span", "", "Reply"),
      el("small", "", `from ${state.thread.inbox_address}`),
    );
    trigger.addEventListener("click", () => {
      state.replyDraft = {
        replyTo: target.id,
        message: "",
        requestId: crypto.randomUUID(),
      };
      renderReply();
      $("#reply-body")?.focus();
    });
    slot.append(trigger);
    return;
  }
  const target = state.messages.find((m) => m.id === state.replyDraft.replyTo);
  if (!target) {
    state.replyDraft = null;
    renderReply();
    return;
  }
  const form = el("form", "reply-form");
  const head = el("div", "reply-head");
  head.append(
    document.createTextNode("Replying as "),
    el("strong", "", state.thread.inbox_address),
  );
  const recipients =
    target.direction === "outbound"
      ? target.to
      : target.reply_to.length
        ? target.reply_to
        : [{ address: target.from_email }];
  head.append(el("div", "message-addresses", `To ${addressText(recipients)}`));
  const textarea = el("textarea");
  textarea.id = "reply-body";
  textarea.placeholder = "Write a reply…";
  textarea.setAttribute("aria-label", "Reply message");
  textarea.required = true;
  textarea.maxLength = 100000;
  textarea.value = state.replyDraft.message;
  textarea.disabled = !!state.replyDraft.attempted;
  textarea.addEventListener(
    "input",
    () => (state.replyDraft.message = textarea.value),
  );
  const error = el("p", "error");
  error.setAttribute("role", "alert");
  const footer = el("div", "reply-footer");
  const cancel = el("button", "cancel-reply", "Discard");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    if (state.replyDraft.message && !window.confirm("Discard this reply?"))
      return;
    state.replyDraft = null;
    renderReply();
  });
  const send = el(
    "button",
    "primary",
    state.replyDraft.attempted ? "Retry same reply ↗" : "Send reply ↗",
  );
  send.type = "submit";
  footer.append(cancel, send);
  form.append(head, textarea, error, footer);
  slot.append(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const draft = state.replyDraft;
    send.disabled = true;
    textarea.disabled = true;
    draft.attempted = true;
    error.textContent = "";
    try {
      const result = await api("send", {
        replyTo: draft.replyTo,
        message: draft.message,
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
      if (e.status === 400) {
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
$("#compose").addEventListener("click", () => {
  if (!state.composeRequest) {
    $("#compose-form").reset();
    $("#compose-from").value =
      state.inbox === "support" || state.inbox === "admin"
        ? `${state.inbox}@${state.user.email.split("@")[1]}`
        : state.user.email;
    state.composeRequest = { requestId: crypto.randomUUID() };
  }
  $("#composer").showModal();
});
function closeCompose() {
  if (
    $("#compose-body").value &&
    !window.confirm(
      state.composeRequest?.payload
        ? "This send may already be saved. Close and check the conversation list?"
        : "Discard this unsent message?",
    )
  )
    return;
  state.composeRequest = null;
  $("#compose-form").reset();
  $("#compose-form")
    .querySelectorAll("input,textarea,select")
    .forEach((n) => (n.disabled = false));
  $("#compose-error").textContent = "";
  $("#compose-form button[type=submit]").textContent = "Send message ↗";
  $("#composer").close();
  refreshList();
}
$("#close-compose").addEventListener("click", closeCompose);
$("#composer").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeCompose();
});
$("#compose-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget,
    button = form.querySelector("[type=submit]");
  button.disabled = true;
  $("#compose-error").textContent = "";
  const request = state.composeRequest;
  if (!request.payload)
    request.payload = {
      requestId: request.requestId,
      from: $("#compose-from").value,
      to: $("#compose-to").value,
      cc: $("#compose-cc").value,
      subject: $("#compose-subject").value,
      message: $("#compose-body").value,
    };
  form
    .querySelectorAll("input,textarea,select")
    .forEach((n) => (n.disabled = true));
  try {
    const result = await api("send", request.payload);
    state.composeRequest = null;
    form.reset();
    form
      .querySelectorAll("input,textarea,select")
      .forEach((n) => (n.disabled = false));
    $("#composer").close();
    await refreshList();
    await openThread(result.conversationId);
    notify("Message sent and saved.");
    button.textContent = "Send message ↗";
  } catch (error) {
    $("#compose-error").textContent = error.message;
    if (error.status === 400) {
      state.composeRequest = { requestId: crypto.randomUUID() };
      form
        .querySelectorAll("input,textarea,select")
        .forEach((n) => (n.disabled = false));
      button.textContent = "Send message ↗";
    } else {
      button.textContent = "Retry same message ↗";
    }
  } finally {
    button.disabled = false;
  }
});
window.addEventListener("beforeunload", (event) => {
  if (state.replyDraft?.message || $("#compose-body").value) {
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
