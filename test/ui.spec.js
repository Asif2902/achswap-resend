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
  await expect(page.locator(".message-body").last()).toHaveText(
    "Thanks Jane. We’re checking on this for you.",
  );
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
  await expect(page.locator(".message-body").last()).toHaveText(
    "Thanks Jane. We’re checking on this for you.",
  );
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
test("HTML content is text-only and does not request tracking resources", async ({
  page,
}) => {
  const external = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3031"))
      external.push(request.url());
  });
  await login(page);
  await page.getByRole("button", { name: "An HTML message — Support" }).click();
  await expect(page.locator(".message-body")).toContainText("Hello from HTML.");
  expect(external).toEqual([]);
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
