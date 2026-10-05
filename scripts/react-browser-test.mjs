import puppeteer from "puppeteer";
import assert from "node:assert/strict";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const base = process.env.PPC_BASE || "http://127.0.0.1:5124";
const chrome =
  process.env.PPC_CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
const browser = await puppeteer.launch({
  headless: true,
  ...(chrome ? { executablePath: chrome } : {}),
  args: ["--no-sandbox"],
});
const shots = resolve(process.env.PPC_SCREENSHOTS || "test-results/browser");
mkdirSync(shots, { recursive: true });
const errors = [],
  title = "Kitchen tap browser " + Date.now();
const demo = {
  tenant: "sarahwilliams@example.com",
  manager: "michael.jacobs@obsrealty.co.za",
  technician: "johan.vdm@obsrealty.co.za",
  admin: "admin@obsrealty.co.za",
};
let checks = 0;
function pass(name) {
  checks++;
  console.log("PASS " + name);
}
async function click(page, text) {
  await page.waitForFunction(
    (text) =>
      [
        ...document.querySelectorAll(
          "dialog[open] button,dialog[open] a,button,a",
        ),
      ].some((e) => e.textContent.trim() === text),
    {},
    text,
  );
  await page.evaluate(
    (text) =>
      [
        ...document.querySelectorAll(
          document.querySelector("dialog[open]")
            ? "dialog[open] button,dialog[open] a"
            : "button,a",
        ),
      ]
        .find((e) => e.textContent.trim() === text)
        .click(),
    text,
  );
}
async function text(page, value) {
  await page.waitForFunction(
    (value) => document.body.innerText.includes(value),
    {},
    value,
  );
}
async function fill(page, selector, value) {
  await page.$eval(selector, (e) => {
    e.value = "";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(selector, value);
}
async function login(role) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.setViewport({ width: 1440, height: 1000 });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
  await page.goto(base);
  await page.waitForSelector("input[name=email]");
  await page.type("input[name=email]", demo[role]);
  await page.type(
    "input[name=password]",
    process.env.DEMO_PASSWORD || "PropCare123!",
  );
  await click(page, "Sign in to PropCare");
  await text(page, "Good day");
  pass(role + " login");
  return page;
}
async function shot(page, name) {
  await page.screenshot({
    path: resolve(shots, name + ".png"),
    fullPage: true,
  });
}
async function nav(page, path, heading) {
  await page.bringToFront();
  await page.goto(base + "/#/" + path);
  await text(page, heading);
}
async function findRequest(page) {
  await nav(page, "requests", "Every request");
  await page.type('input[aria-label="Search requests"]', title);
  await page.waitForSelector(".request-card");
  await page.click(".request-card");
  await text(page, title);
}
try {
  const tenant = await login("tenant");
  await shot(tenant, "tenant-overview");
  await nav(tenant, "report", "Report an issue");
  await tenant.waitForSelector("select[name=unitId]");
  await tenant.select("select[name=categoryId]", "plumbing");
  await tenant.type("input[name=title]", title);
  await tenant.type(
    "textarea[name=detail]",
    "A leak under the sink. Please inspect the washer.",
  );
  await tenant.select("select[name=urgency]", "high");
  await (
    await tenant.$("input[name=photo]")
  ).uploadFile(resolve("scripts/fixtures/repair.png"));
  await click(tenant, "Submit maintenance request");
  await tenant.waitForFunction(() => location.hash.startsWith("#/request/"));
  await tenant.waitForSelector(".photos img");
  const id = await tenant.evaluate(() => location.hash.split("/").at(-1));
  pass("tenant submits a request with a real photo");
  await shot(tenant, "tenant-request");
  const manager = await login("manager");
  await findRequest(manager);
  await click(manager, "Assign");
  await manager.waitForSelector("select[name=technicianId]");
  await manager.select("select[name=technicianId]", "T1");
  await manager.type(
    "textarea[name=note]",
    "Please bring a replacement washer.",
  );
  await click(manager, "Save changes");
  await text(manager, "Assigned");
  pass("manager assigns technician");
  const tech = await login("technician");
  await findRequest(tech);
  await click(tech, "Accept");
  await tech.waitForSelector("dialog[open]");
  await click(tech, "Accept");
  await tech.waitForSelector("dialog", { hidden: true });
  await text(tech, "In progress");
  await click(tech, "Mark complete");
  await tech.waitForSelector("dialog[open]");
  await tech.type(
    "textarea[name=note]",
    "Washer replaced and pressure tested.",
  );
  await click(tech, "Complete");
  await tech.waitForSelector("dialog", { hidden: true });
  await text(tech, "Completed");
  pass("technician accepts and completes work");
  await nav(tenant, "request/" + id, title);
  await click(tenant, "Confirm resolved");
  await tenant.waitForSelector("dialog[open]");
  await click(tenant, "Confirm");
  await tenant.waitForSelector("dialog", { hidden: true });
  await text(tenant, "Closed");
  await click(tenant, "Rate the work");
  await click(tenant, "Submit rating");
  await tenant.waitForSelector("dialog", { hidden: true });
  await text(tenant, "5/5");
  pass("tenant confirms then rates completed work");
  await shot(tenant, "request-closed");
  const admin = await login("admin");
  for (const [page, heading] of [
    ["users", "People and permissions"],
    ["properties", "Your property portfolio"],
    ["units", "Tenants and their homes"],
    ["categories", "Maintenance categories"],
    ["technicians", "Your maintenance team"],
    ["reports", "Maintenance reports"],
    ["settings", "Workspace settings"],
  ]) {
    await nav(admin, page, heading);
    await admin.waitForFunction(() => !document.querySelector(".loading"));
    assert.equal(
      await admin.$(".error"),
      null,
      page + " should render without an API error",
    );
    pass("admin " + page);
    await shot(admin, "admin-" + page);
  }
  await nav(admin, "categories", "Maintenance categories");
  await click(admin, "Add category");
  await admin.waitForSelector("dialog input[name=name]");
  await admin.type("dialog input[name=name]", "Browser category " + Date.now());
  await click(admin, "Save changes");
  await admin.waitForSelector("dialog", { hidden: true });
  await text(admin, "Browser category");
  pass("admin creates a usable category");
  const onboarding = Date.now();
  const tenantName = "Browser Tenant " + onboarding;
  const propertyName = "Browser Property " + onboarding;
  await nav(admin, "users", "People and permissions");
  await click(admin, "Add user");
  await admin.waitForSelector("dialog input[name=name]");
  await admin.type("dialog input[name=name]", tenantName);
  await admin.type(
    "dialog input[name=email]",
    `browser-${onboarding}@example.com`,
  );
  await admin.type("dialog input[name=password]", "PropCare123!");
  await click(admin, "Save changes");
  await admin.waitForSelector("dialog", { hidden: true });
  await text(admin, tenantName);
  pass("admin creates a tenant account");
  await nav(admin, "properties", "Your property portfolio");
  await click(admin, "Add property");
  await admin.waitForSelector("dialog select[name=managerId]");
  await admin.type("dialog input[name=name]", propertyName);
  await admin.type("dialog input[name=address]", "10 Example Road");
  await admin.type("dialog input[name=area]", "Observatory");
  const managerId = await admin.$eval(
    "select[name=managerId]",
    (s) =>
      [...s.options].find((o) => o.textContent.includes("Michael Jacobs"))
        .value,
  );
  await admin.select("select[name=managerId]", managerId);
  await click(admin, "Save changes");
  await admin.waitForSelector("dialog", { hidden: true });
  await text(admin, propertyName);
  pass("admin creates a managed property");
  await nav(admin, "units", "Tenants and their homes");
  await click(admin, "Link a tenant");
  await admin.waitForSelector("dialog select[name=userId]");
  const tenantId = await admin.$eval(
    "select[name=userId]",
    (s, name) => [...s.options].find((o) => o.textContent.includes(name)).value,
    tenantName,
  );
  const propertyId = await admin.$eval(
    "select[name=propertyId]",
    (s, name) => [...s.options].find((o) => o.textContent === name).value,
    propertyName,
  );
  await admin.select("select[name=userId]", tenantId);
  await admin.select("select[name=propertyId]", propertyId);
  await admin.type("dialog input[name=name]", "Unit 1");
  await click(admin, "Save changes");
  await admin.waitForSelector("dialog", { hidden: true });
  await text(admin, tenantName);
  pass("admin links the tenant to the new property and unit");
  await nav(tenant, "notifications", "Notifications");
  await text(tenant, title);
  pass("tenant receives lifecycle notifications");
  await nav(manager, "reports", "Maintenance reports");
  await manager.waitForSelector("progress");
  await shot(manager, "manager-reports");
  pass("reports render live aggregates");
  await tenant.setViewport({ width: 390, height: 844 });
  await nav(tenant, "overview", "Good day");
  assert.ok(
    await tenant.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await shot(tenant, "mobile-overview");
  await tenant.click('[aria-label="Toggle navigation"]');
  await tenant.waitForSelector(".sidebar.expanded");
  await shot(tenant, "mobile-navigation");
  pass("mobile layout has no horizontal overflow and navigation opens");
  await tenant.setViewport({ width: 1440, height: 1000 });
  await tenant.keyboard.press("Tab");
  const unnamed = await tenant.evaluate(() =>
    [...document.querySelectorAll("button,input,select,textarea")]
      .filter(
        (e) =>
          e.getClientRects().length &&
          !e.getAttribute("aria-label") &&
          !e.textContent.trim() &&
          !e.labels?.length,
      )
      .map((e) => e.outerHTML),
  );
  assert.deepEqual(unnamed, []);
  pass("visible controls have accessible labels");
  await tenant.reload();
  await text(tenant, "Good day");
  pass("reload restores session through refresh cookie");
  await click(tenant, "Sign out");
  await tenant.waitForSelector("input[name=password]");
  await tenant.reload();
  await tenant.waitForSelector("input[name=password]");
  pass("logout remains signed out after reload");
  assert.deepEqual(errors, []);
  pass("no JavaScript or CSP errors");
  console.log(`${checks} browser checks passed. Screenshots: ${shots}`);
} catch (e) {
  console.error(e);
  console.error("Browser errors:", errors);
  for (const [i, page] of (await browser.pages()).entries())
    await page
      .screenshot({ path: resolve(shots, "failure-" + i + ".png") })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
