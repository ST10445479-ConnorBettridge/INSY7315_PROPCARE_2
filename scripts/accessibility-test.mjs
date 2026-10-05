import puppeteer from "puppeteer";
import { AxePuppeteer } from "@axe-core/puppeteer";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
const results = [];
mkdirSync("test-results/accessibility", { recursive: true });
async function settled(page) {
  await page.waitForFunction(() => !document.querySelector(".loading"));
  await page.evaluate(() => document.fonts.ready);
}
async function scan(page, name) {
  await settled(page);
  const { violations, incomplete } = await new AxePuppeteer(page)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const overflow = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "main .panel,main .request-card,main .stat,main .page-heading,main input,main select,main textarea",
      ),
    ]
      .filter(
        (e) =>
          e.getClientRects().length &&
          (e.getBoundingClientRect().right > innerWidth + 1 ||
            e.getBoundingClientRect().left < -1),
      )
      .map((e) => e.className || e.tagName),
  );
  results.push({
    name,
    violations: violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    incomplete: incomplete.map((v) => ({ id: v.id, count: v.nodes.length })),
    overflow,
  });
  console.log(
    `${name}: ${violations.length} rule violations; ${overflow.length} overflowing controls`,
  );
  if (violations.length || overflow.length)
    await page.screenshot({
      path: resolve("test-results/accessibility", name + ".png"),
      fullPage: true,
    });
}
try {
  for (const [role, email, routes] of [
    [
      "tenant",
      "sarahwilliams@example.com",
      [
        "overview",
        "requests",
        "report",
        "properties",
        "notifications",
        "profile",
      ],
    ],
    [
      "manager",
      "michael.jacobs@obsrealty.co.za",
      [
        "overview",
        "requests",
        "properties",
        "tenants",
        "technicians",
        "reports",
        "notifications",
        "profile",
      ],
    ],
    [
      "technician",
      "johan.vdm@obsrealty.co.za",
      [
        "overview",
        "requests",
        "properties",
        "schedule",
        "notifications",
        "profile",
      ],
    ],
    [
      "admin",
      "admin@obsrealty.co.za",
      [
        "overview",
        "requests",
        "users",
        "properties",
        "units",
        "categories",
        "technicians",
        "reports",
        "settings",
        "notifications",
        "profile",
      ],
    ],
  ]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.goto(base);
    await page.waitForSelector("input[name=email]");
    if (role === "tenant") await scan(page, "login-desktop");
    await page.type("input[name=email]", email);
    await page.type(
      "input[name=password]",
      process.env.DEMO_PASSWORD || "PropCare123!",
    );
    await page.click("button[type=submit]");
    await page.waitForSelector("#main");
    for (const route of routes) {
      await page.goto(base + "/#/" + route);
      await settled(page);
      await scan(page, role + "-" + route);
    }
    await page.goto(base + "/#/requests");
    await settled(page);
    await page.waitForSelector(".request-card");
    await page.click(".request-card");
    await page.waitForSelector(".detail-grid");
    await scan(page, role + "-detail");
    if (role === "admin") {
      await page.goto(base + "/#/properties");
      await settled(page);
      await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .find((e) => e.textContent.includes("Add property"))
          .click(),
      );
      await page.waitForSelector("dialog input[name=name]");
      await scan(page, "admin-property-dialog");
      await page.keyboard.press("Escape");
    }
    for (const width of [320, 390, 768]) {
      await page.setViewport({ width, height: 900 });
      for (const route of [
        "overview",
        "requests",
        role === "tenant" ? "report" : role === "admin" ? "users" : "profile",
      ]) {
        await page.goto(base + "/#/" + route);
        await scan(page, role + "-" + route + "-" + width);
      }
    }
    await context.close();
  }
} finally {
  writeFileSync(
    "test-results/accessibility/results.json",
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
const failed = results.filter((r) => r.violations.length || r.overflow.length);
console.log(
  `${results.length} page/viewport scans; ${failed.length} with failures. Manual-review items are retained in results.json.`,
);
if (failed.length) process.exitCode = 1;
