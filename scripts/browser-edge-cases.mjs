import puppeteer from "puppeteer";
import assert from "node:assert/strict";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
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
const passed = [],
  suffix = Date.now(),
  password = process.env.DEMO_PASSWORD || "PropCare123!";
function pass(name) {
  passed.push(name);
  console.log("PASS " + name);
}
async function click(page, name) {
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll("button")].some(
        (e) => e.textContent.trim() === name,
      ),
    {},
    name,
  );
  await page.evaluate(
    (name) =>
      [...document.querySelectorAll("button")]
        .find((e) => e.textContent.trim() === name)
        .click(),
    name,
  );
}
async function text(page, value) {
  await page.waitForFunction(
    (value) => document.body.innerText.includes(value),
    {},
    value,
  );
}
async function page() {
  const context = await browser.createBrowserContext();
  const p = await context.newPage();
  await p.setViewport({ width: 1440, height: 1000 });
  await p.goto(base);
  await p.waitForSelector("input[name=email]");
  return p;
}
try {
  const tenant = await page();
  // Reach the form using real Tab navigation, then submit with Enter.
  for (
    let i = 0;
    i < 8 &&
    !(await tenant.evaluate(
      () => document.activeElement?.getAttribute("name") === "email",
    ));
    i++
  )
    await tenant.keyboard.press("Tab");
  assert.equal(
    await tenant.evaluate(() => document.activeElement.name),
    "email",
  );
  await tenant.keyboard.type("sarahwilliams@example.com");
  await tenant.keyboard.press("Tab");
  await tenant.keyboard.type(password);
  await tenant.keyboard.press("Tab");
  await tenant.keyboard.press("Enter");
  await tenant.waitForSelector("#main");
  pass("keyboard-only login");
  await tenant.goto(base + "/#/report");
  await tenant.waitForSelector("input[name=title]");
  await tenant.waitForSelector("select[name=categoryId]");
  let creates = 0,
    failPhoto = true,
    failLogout = false;
  await tenant.setRequestInterception(true);
  tenant.on("request", (request) => {
    if (request.method() === "POST" && request.url() === base + "/api/requests")
      creates++;
    if (
      request.method() === "POST" &&
      ((failPhoto && request.url().endsWith("/photos")) ||
        (failLogout && request.url().endsWith("/auth/logout")))
    ) {
      if (request.url().endsWith("/photos")) failPhoto = false;
      request.respond({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Simulated connection failure" }),
      });
    } else request.continue();
  });
  await click(tenant, "Submit maintenance request");
  assert.equal(creates, 0);
  pass("required fields prevent an empty request");
  await tenant.type("input[name=title]", "Retry audit " + suffix);
  await tenant.type("textarea[name=detail]", "A test of interrupted uploads.");
  await tenant.select("select[name=categoryId]", "plumbing");
  await (
    await tenant.$("input[name=photo]")
  ).uploadFile(resolve("scripts/fixtures/repair.png"));
  await click(tenant, "Submit maintenance request");
  await text(tenant, "Your request was saved, but the photo failed");
  assert.equal(creates, 1);
  assert.equal(
    await tenant.$eval("input[name=title]", (e) => e.disabled),
    true,
  );
  await click(tenant, "Retry photo upload");
  await tenant.waitForSelector(".photos img");
  assert.equal(creates, 1);
  pass("failed photo upload retries without duplicating the saved request");
  const payload = '<img src=x onerror="window.auditXss=true"> audit ' + suffix;
  await tenant.type("textarea[name=text]", payload);
  await click(tenant, "Add update");
  await text(tenant, payload);
  assert.equal(await tenant.evaluate(() => Boolean(window.auditXss)), false);
  assert.equal(await tenant.$("img[src=x]"), null);
  pass("stored markup is rendered as text rather than executed");
  await click(tenant, "Add photo");
  await tenant.waitForSelector("dialog[open]");
  for (let i = 0; i < 12; i++) {
    await tenant.keyboard.press("Tab");
    assert.equal(
      await tenant.evaluate(
        () =>
          Boolean(document.activeElement.closest("dialog")) ||
          document.activeElement === document.body,
      ),
      true,
    );
  }
  await tenant.keyboard.press("Escape");
  await tenant.waitForSelector("dialog", { hidden: true });
  await tenant.waitForFunction(() =>
    document.activeElement?.textContent.includes("Add photo"),
  );
  pass(
    "dialog keyboard focus is contained and returns to its trigger on Escape",
  );
  failLogout = true;
  await click(tenant, "Sign out");
  await text(tenant, "Sign out failed");
  assert.ok(await tenant.$("#main"));
  failLogout = false;
  await click(tenant, "Sign out");
  await tenant.waitForSelector("input[name=email]");
  pass(
    "failed sign-out reports the failure instead of claiming the session ended",
  );
  await click(tenant, "New tenant? Create an account");
  await tenant.waitForSelector("input[name=name]");
  await tenant.type("input[name=name]", "Registration Browser Audit");
  await tenant.type(
    "input[name=email]",
    `browser-register-${suffix}@example.com`,
  );
  await tenant.type("input[name=password]", password);
  await click(tenant, "Create tenant account");
  await text(tenant, "Account created.");
  await tenant.type("input[name=password]", password);
  await click(tenant, "Sign in to PropCare");
  await tenant.waitForSelector("#main");
  await tenant.goto(base + "/#/report");
  await text(tenant, "Your home is not linked yet");
  pass(
    "browser registration leads to a tenant account awaiting a verified tenancy",
  );
  const manager = await page();
  await manager.type("input[name=email]", "michael.jacobs@obsrealty.co.za");
  await manager.type("input[name=password]", password);
  await click(manager, "Sign in to PropCare");
  await manager.waitForSelector("#main");
  await manager.goto(base + "/#/reports");
  await manager.waitForSelector("progress");
  await manager.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.auditCsv = blob.text();
      return create(blob);
    };
  });
  await click(manager, "Download CSV");
  const csv = await manager.evaluate(() => window.auditCsv);
  assert.match(csv, /"Section","Name","Count"/);
  assert.match(csv, /"Category"/);
  pass("report download contains CSV headers and live category rows");
} finally {
  mkdirSync("test-results/browser-edge-cases", { recursive: true });
  writeFileSync(
    "test-results/browser-edge-cases/results.json",
    JSON.stringify({ passed }, null, 2),
  );
  await browser.close();
}
console.log(`${passed.length} browser edge-case checks passed.`);
