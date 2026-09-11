import { test, expect } from "@playwright/test";
async function login(page) {
  await page.goto("/");
  await page.getByLabel("Email address").fill("asif@achswap.app");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator(".conversation").first()).toBeVisible();
}
test("filters isolate personal mail; support reply uses support and is persisted", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await expect(page.getByText("John private note")).toHaveCount(0);
  await page.locator("[data-inbox=personal]").click();
  await expect(page.locator(".conversation")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Notes for our next conversation — Personal" })
    .click();
  await page
    .getByRole("button", { name: /Reply from asif@achswap.app/ })
    .click();
  await expect(page.locator(".reply-head")).toContainText("asif@achswap.app");
  await page.locator("[data-inbox=support]").click();
  await page
    .getByRole("button", { name: "A quick question about my swap — Support" })
    .click();
  await page
    .getByRole("button", { name: /Reply from support@achswap.app/ })
    .click();
  await expect(page.locator(".reply-head")).toContainText(
    "support@achswap.app",
  );
  await page
    .getByLabel("Reply message")
    .fill("Thanks Jane. We’re checking on this for you.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(
    page
      .locator("#reader .message-body")
      .last()
      .frameLocator("iframe")
      .locator("body"),
  ).toContainText("Thanks Jane. We’re checking on this for you.");
  await expect(page.locator(".message-status").last()).toContainText("Sent");
  await page.screenshot({
    path: "test-results/desktop-mailbox.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("#workspace")).toBeVisible();
  await page
    .getByRole("button", { name: "A quick question about my swap — Support" })
    .click();
  await expect(
    page
      .locator("#reader .message-body")
      .last()
      .frameLocator("iframe")
      .locator("body"),
  ).toContainText("Thanks Jane. We’re checking on this for you.");
  expect(errors).toEqual([]);
});
test("new personal message appears in Sent and cannot impersonate another member", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "New message", exact: true }).click();
  await expect(page.locator("#compose-from option")).toHaveCount(3);
  await expect(page.locator("#compose-from")).toHaveValue("asif@achswap.app");
  await page.locator("#compose-to").fill("friend@example.net");
  await page.locator("#compose-subject").fill("A personal follow-up");
  await page.locator("#compose-body").fill("Hello from my personal inbox.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#composer")).not.toBeVisible();
  await expect(page.locator(".reader-head")).toContainText("asif@achswap.app");
  await page.locator("[data-view=sent]").click();
  await expect(
    page.getByRole("button", { name: "A personal follow-up — Personal" }),
  ).toBeVisible();
});
test("HTML email renders buttons, images and layout without running scripts", async ({
  page,
}) => {
  const errors = [];
  const dialogs = [];
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
  );
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    dialog.dismiss();
  });
  await page.route(/https:\/\/cdn\.example\//, (route) =>
    route.fulfill({ contentType: "image/png", body: pixel }),
  );
  await login(page);
  await page.getByRole("button", { name: "An HTML message — Support" }).click();
  const frame = page
    .locator(".message-body.is-html")
    .first()
    .frameLocator("iframe");
  await expect(frame.locator("body")).toContainText("Hello from HTML.");
  await expect(frame.locator('a[data-email-role="button"]')).toHaveText(
    "Get started",
  );
  await expect(frame.locator('a[data-email-role="link"]')).toContainText("docs");
  await expect(frame.locator("img")).toHaveAttribute(
    "src",
    "https://cdn.example/logo.png",
  );
  await expect(frame.locator("table")).toBeVisible();
  expect(errors).toEqual([]);
  expect(dialogs).toEqual([]);
});
test("compose CC/BCC and HTML are sent to the API", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "New message", exact: true }).click();
  await page.locator("#compose-to").fill("friend@example.net");
  await page.getByRole("button", { name: "Cc", exact: true }).click();
  await page.locator("#compose-cc").fill("cc@example.net");
  await page.getByRole("button", { name: "Bcc", exact: true }).click();
  await page.locator("#compose-bcc").fill("secret@example.net");
  await page.locator("#compose-subject").fill("Styled hello");
  await page.locator("#compose-body").fill("Hello with a button");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.locator("#compose-preview").frameLocator("iframe").locator("body"),
  ).toContainText("Hello with a button");
  const pending = page.waitForRequest("**/api/send");
  await page.getByRole("button", { name: "Send message" }).click();
  const payload = (await pending).postDataJSON();
  expect(payload.to).toContain("friend@example.net");
  expect(payload.cc).toContain("cc@example.net");
  expect(payload.bcc).toContain("secret@example.net");
  expect(payload.html).toMatch(/Hello with a button/);
  await expect(page.locator("#composer")).not.toBeVisible();
  await expect(page.locator(".message-addresses").last()).toContainText(
    "Cc: cc@example.net",
  );
  await expect(page.locator(".message-addresses").last()).toContainText(
    "Bcc: secret@example.net",
  );
});
test("reply all prefills recipients and omits the current inbox", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Team thread — Support" }).click();
  await page.getByRole("button", { name: "Reply all" }).first().click();
  await expect(page.locator("#reply-to")).toHaveValue(
    "jane@example.net, other@example.net",
  );
  await expect(page.locator("#reply-cc")).toHaveValue("cc@example.net");
  await expect(page.locator("#reply-to")).not.toHaveValue("support@achswap.app");
  await expect(page.locator("#reply-cc")).not.toHaveValue("support@achswap.app");
  await page.getByLabel("Reply message").fill("Looping everyone in.");
  const pending = page.waitForRequest("**/api/send");
  await page.getByRole("button", { name: "Send reply" }).click();
  const payload = (await pending).postDataJSON();
  expect(payload.mode).toBe("replyAll");
  expect(payload.to).toContain("jane@example.net");
  expect(payload.to).toContain("other@example.net");
  expect(payload.cc).toContain("cc@example.net");
  expect(payload.html).toMatch(/Looping everyone in/);
});
test("mobile mailbox, reader and composer fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.locator("[data-inbox=admin]").click();
  await page
    .getByRole("button", { name: "September workspace review — Admin" })
    .click();
  await page
    .getByRole("button", { name: /Reply from admin@achswap.app/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Back to conversations" }),
  ).toBeVisible();
  await expect(page.locator(".reply-head")).toContainText("admin@achswap.app");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-mailbox.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to conversations" }).click();
  await expect(page.locator(".list-pane")).toBeVisible();
  await page.getByRole("button", { name: "New message", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "New message" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeInViewport();
  await page.locator("#compose-body").fill("An unsent mobile draft.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Close new message" }).click();
  await expect(page.locator("#compose-body")).toHaveText(
    "An unsent mobile draft.",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Close new message" }).click();
  await expect(page.locator("#composer")).not.toBeVisible();
});

test("mailbox panes and composer stay usable across phone, tablet and desktop widths", async ({
  page,
}) => {
  await login(page);
  for (const width of [320, 390, 680, 768, 960, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator("[data-inbox=all]").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("[data-inbox=admin]")).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Sign out" }).filter({ visible: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "An HTML message — Support" })
      .click();
    await page
      .getByRole("button", { name: /Reply from support@achswap.app/ })
      .click();
    await page
      .getByRole("button", { name: "Send reply" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Send reply" }),
    ).toBeInViewport();
    expect(
      await page
        .locator("#reader")
        .evaluate((reader) => reader.scrollWidth <= reader.clientWidth),
    ).toBe(true);
    await page
      .getByRole("button", { name: "New message", exact: true })
      .click();
    expect(
      await page
        .locator("#composer")
        .evaluate((composer) => composer.scrollWidth <= composer.clientWidth),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Send message" }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "Close new message" }).click();
    if (width <= 960) {
      await page.getByRole("button", { name: "Back to conversations" }).click();
    }
  }
});
test("forward sends to new recipients with the original HTML quoted", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "An HTML message — Support" }).click();
  await page.getByRole("button", { name: "Forward" }).first().click();
  await expect(page.locator("#reply-to")).toHaveValue("");
  await expect(page.locator("#reply-subject")).toHaveValue(
    "Fwd: An HTML message",
  );
  await page.locator("#reply-to").fill("new@example.net");
  await page.getByRole("button", { name: "Bcc", exact: true }).click();
  await page.locator("#reply-bcc").fill("hidden@example.net");
  const pending = page.waitForRequest("**/api/send");
  await page.getByRole("button", { name: "Send reply" }).click();
  const payload = (await pending).postDataJSON();
  expect(payload.mode).toBe("forward");
  expect(payload.to).toContain("new@example.net");
  expect(payload.bcc).toContain("hidden@example.net");
  expect(payload.html).toMatch(/Forwarded message/);
  expect(payload.html).toMatch(/Hello from HTML/);
  await expect(
    page
      .locator("#reader .message-body.is-html")
      .last()
      .frameLocator("iframe")
      .locator("body"),
  ).toContainText("Hello from HTML");
});
test("API requires auth and denies direct requests to a different personal inbox", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/conversations")).status()).toBe(401);
  await login(page);
  const result = await page.evaluate(async () => {
    const response = await fetch("/api/conversation?id=private", {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("achswap_token")}`,
      },
    });
    return response.status;
  });
  expect(result).toBe(404);
});
