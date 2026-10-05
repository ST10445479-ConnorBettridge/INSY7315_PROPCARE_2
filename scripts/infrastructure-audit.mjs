// Isolated, opt-in infrastructure audit. Creates uniquely named audit databases; never drops or rewrites the application database.
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  createWriteStream,
  cpSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const settings = JSON.parse(
  readFileSync(resolve(root, ".local/settings.json")),
);
const connection = settings.ConnectionStrings.PropCare;
const fields = Object.fromEntries(
  connection
    .split(";")
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i).toLowerCase(), s.slice(i + 1)];
    }),
);
assert.equal(
  fields.database,
  "propcare",
  "This local audit expects the configured PropCare development database.",
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(fields.host),
  "This audit runs against a local PostgreSQL server only.",
);
const pg =
  process.env.PPC_PG_BIN || resolve(root, ".local/postgresql/pgsql/bin");
const pgEnv = {
  ...process.env,
  PGHOST: fields.host,
  PGPORT: fields.port || "5432",
  PGUSER: fields.username,
  PGPASSWORD: fields.password,
};
const stamp = Date.now(),
  base = "http://127.0.0.1:5127",
  output = resolve(root, "test-results/infrastructure");
const scratch = resolve(root, ".local/audit-" + stamp);
mkdirSync(output, { recursive: true });
mkdirSync(scratch, { recursive: true });
const names = {
  bootstrap: `propcare_audit_bootstrap_${stamp}`,
  scale: `propcare_audit_scale_${stamp}`,
  restore: `propcare_audit_restore_${stamp}`,
};
const evidence = {
  date: new Date().toISOString(),
  databases: names,
  checks: [],
  performance: null,
};
let server, log;
function pass(s) {
  evidence.checks.push(s);
  console.log("PASS " + s);
}
function bin(name) {
  return join(pg, name + (process.platform === "win32" ? ".exe" : ""));
}
function sql(database, text) {
  return execFileSync(
    bin("psql"),
    ["-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-d", database, "-c", text],
    {
      env: pgEnv,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}
function createDatabase(name) {
  assert.match(name, /^propcare_audit_(bootstrap|scale|restore)_\d+$/);
  sql("postgres", `CREATE DATABASE "${name}"`);
}
async function stop() {
  if (server && server.exitCode === null) {
    const ended = once(server, "exit");
    server.kill();
    await ended;
  }
  log?.end();
  server = null;
}
async function start(database, seed, storage) {
  log = createWriteStream(join(scratch, database + ".log"));
  server = spawn("dotnet", ["PropCare.Api.dll", "--urls", base], {
    cwd: resolve(root, ".local/publish"),
    windowsHide: true,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: "Production",
      ConnectionStrings__PropCare: connection.replace(
        /Database=[^;]+/i,
        "Database=" + database,
      ),
      Jwt__Key: "isolated-audit-signing-key-never-use-for-real-data",
      SeedDemo: String(seed),
      DemoPassword: "PropCare123!",
      BootstrapAdmin__Email: "bootstrap@example.com",
      BootstrapAdmin__Password: "BootstrapAudit123!",
      Storage__Path: storage,
      RELEASE_SHA: "audit-local-uncommitted",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null)
      throw new Error(
        "Published application exited; inspect the ignored audit logs.",
      );
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Published application did not become healthy.");
}
async function call(path, method = "GET", body, token, headers = {}) {
  return fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-PropCare": "1",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function data(path, method, body, token) {
  const r = await call(path, method, body, token);
  assert.ok(r.ok, `${method || "GET"} ${path}: ${r.status}`);
  const json = await r.json();
  return json.data ?? json;
}
try {
  try {
    await fetch(base + "/api/health");
    throw new Error("Audit port is already occupied.");
  } catch (e) {
    if (e.message === "Audit port is already occupied.") throw e;
  }
  createDatabase(names.bootstrap);
  await start(names.bootstrap, false, join(scratch, "bootstrap-photos"));
  const health = await data("/health");
  assert.equal(health.version, "audit-local-uncommitted");
  const html = await (await fetch(base)).text();
  assert.match(html, /assets\/index-/);
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  assert.equal((await fetch(base + asset)).status, 200);
  assert.match(
    await (await fetch(base + "/third-party-notices.txt")).text(),
    /ISC License/,
  );
  pass(
    "Published React assets and dependency notices are served by the production host",
  );
  const loginResponse = await call("/auth/login", "POST", {
    email: "bootstrap@example.com",
    password: "BootstrapAudit123!",
  });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.headers.get("set-cookie");
  assert.match(cookie, /httponly/i);
  assert.match(cookie, /secure/i);
  assert.match(cookie, /samesite=strict/i);
  const bootstrap = (await loginResponse.json()).data;
  assert.equal(bootstrap.user.role, "admin");
  const hsts = await new Promise((resolve, reject) => {
    const req = httpRequest(
      base + "/api/health",
      {
        headers: { "X-Forwarded-Proto": "https", Host: "audit.propcare.test" },
      },
      (r) => {
        r.resume();
        r.on("end", () =>
          resolve(r.headers["strict-transport-security"] || ""),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.match(hsts, /max-age=/);
  pass(
    "Fresh PostgreSQL migration, bootstrap administrator, secure cookie and trusted-proxy HSTS",
  );
  const tokens = await Promise.all(
    Array.from({ length: 32 }, () =>
      call("/auth/login", "POST", {
        email: "missing@example.com",
        password: "wrong",
      }),
    ),
  );
  assert.ok(tokens.some((r) => r.status === 429));
  pass("Production authentication rate limiter returns HTTP 429");
  await stop();
  createDatabase(names.scale);
  const uploads = join(scratch, "photos");
  await start(names.scale, true, uploads);
  sql(
    names.scale,
    `INSERT INTO "Properties" ("Id","Name","Address","Area","ManagerId","Active") SELECT 'AUDIT-P-'||g, 'Audit property '||g, 'Example address', 'Audit area', 'U2', TRUE FROM generate_series(1,1000) g;
 INSERT INTO "Units" ("UserId","PropertyId","Name","Active") SELECT 'U1','AUDIT-P-'||g,'Unit 1',TRUE FROM generate_series(1,1000) g;
 INSERT INTO "Requests" ("Id","PropertyId","TenantId","UnitId","CategoryId","TechnicianId","Title","Detail","Urgency","Status","CreatedAt","UpdatedAt","ScheduledAt")
 SELECT 'AUDIT-R-'||g,u."PropertyId",'U1',u."Id",'plumbing','T1','Load test '||g,'Fixture for isolated load testing','normal',CASE WHEN g%5=0 THEN 'closed' ELSE 'assigned' END, TIMESTAMPTZ '2000-01-01'+g*INTERVAL '1 second',NOW(),NOW()+INTERVAL '1 day'
 FROM generate_series(1,10000) g JOIN "Units" u ON u."PropertyId"='AUDIT-P-'||((g-1)/10+1); ANALYZE;`,
  );
  const manager = await data("/auth/login", "POST", {
    email: "michael.jacobs@obsrealty.co.za",
    password: "PropCare123!",
  });
  const tenant = await data("/auth/login", "POST", {
    email: "sarahwilliams@example.com",
    password: "PropCare123!",
  });
  const technician = await data("/auth/login", "POST", {
    email: "johan.vdm@obsrealty.co.za",
    password: "PropCare123!",
  });
  const matches = await data(
    "/requests/page?q=AUDIT-R-1&pageSize=100",
    "GET",
    undefined,
    manager.token,
  );
  const oldest = await data(
    "/requests/page?q=AUDIT-R-1&pageSize=100&page=" +
      Math.ceil(matches.total / 100),
    "GET",
    undefined,
    manager.token,
  );
  assert.ok(oldest.items.some((r) => r.id === "AUDIT-R-1"));
  const overview = await data(
    "/requests/overview",
    "GET",
    undefined,
    manager.token,
  );
  assert.ok(overview.total > 10000);
  assert.equal(
    overview.total,
    (await data("/requests/page?pageSize=1", "GET", undefined, manager.token))
      .total,
  );
  const schedule = await data(
    "/requests/scheduled",
    "GET",
    undefined,
    technician.token,
  );
  assert.ok(schedule.some((r) => r.id === "AUDIT-R-1"));
  pass(
    "1000 added properties and 10000 requests remain searchable, counted and scheduled beyond the old 500-row boundary",
  );
  const timings = [],
    failures = [],
    paths = [
      "/requests/page?pageSize=24",
      "/requests/overview",
      "/reports",
      "/requests/page?q=Audit%20property%204&pageSize=24",
      "/requests",
    ];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < 200) {
        const i = cursor++,
          path = paths[i % paths.length],
          begin = performance.now();
        const create = path === "/requests";
        const r = await call(
          path,
          create ? "POST" : "GET",
          create
            ? {
                title: "Load write " + i,
                detail: "Load test fixture",
                unitId: 1,
                categoryId: "plumbing",
                urgency: "normal",
              }
            : undefined,
          create ? tenant.token : manager.token,
        );
        await r.arrayBuffer();
        timings.push(performance.now() - begin);
        if (!r.ok) failures.push({ path, status: r.status });
      }
    }),
  );
  timings.sort((a, b) => a - b);
  evidence.performance = {
    propertiesAdded: 1000,
    requestsAdded: 10000,
    requests: 200,
    concurrentClients: 8,
    p50Ms: Math.round(timings[99]),
    p95Ms: Math.round(timings[189]),
    maxMs: Math.round(timings.at(-1)),
    errors: failures.length,
  };
  assert.equal(failures.length, 0);
  console.log("Load result: " + JSON.stringify(evidence.performance));
  pass(
    "160 API reads and 40 request creations completed without errors under eight concurrent local clients",
  );
  const photoData = readFileSync(
    resolve(root, "scripts/fixtures/repair.png"),
  ).toString("base64");
  await data(
    "/requests/AUDIT-R-1/photos",
    "POST",
    { filename: "backup.png", kind: "issue", data: photoData },
    tenant.token,
  );
  const detail = await data(
    "/requests/AUDIT-R-1",
    "GET",
    undefined,
    tenant.token,
  );
  const photoPath = "/requests/AUDIT-R-1/photos/" + detail.photos[0].id;
  const originalBytes = await (
    await call(photoPath, "GET", undefined, tenant.token)
  ).arrayBuffer();
  const originalHash = createHash("sha256")
    .update(Buffer.from(originalBytes))
    .digest("hex");
  const backup = join(scratch, "database.dump");
  execFileSync(bin("pg_dump"), ["-Fc", "-d", names.scale, "-f", backup], {
    env: pgEnv,
    windowsHide: true,
    stdio: "pipe",
  });
  const restoredPhotos = join(scratch, "restored-photos");
  cpSync(uploads, restoredPhotos, { recursive: true });
  await stop();
  createDatabase(names.restore);
  execFileSync(
    bin("pg_restore"),
    ["--exit-on-error", "--no-owner", "-d", names.restore, backup],
    { env: pgEnv, windowsHide: true, stdio: "pipe" },
  );
  await start(names.restore, true, restoredPhotos);
  const restored = await data("/auth/login", "POST", {
    email: "sarahwilliams@example.com",
    password: "PropCare123!",
  });
  const restoredDetail = await data(
    "/requests/AUDIT-R-1",
    "GET",
    undefined,
    restored.token,
  );
  assert.equal(restoredDetail.request.title, detail.request.title);
  const restoredBytes = await (
    await call(photoPath, "GET", undefined, restored.token)
  ).arrayBuffer();
  assert.equal(
    createHash("sha256").update(Buffer.from(restoredBytes)).digest("hex"),
    originalHash,
  );
  assert.equal(
    sql(names.scale, 'SELECT count(*) FROM "Requests"'),
    sql(names.restore, 'SELECT count(*) FROM "Requests"'),
  );
  pass(
    "PostgreSQL dump restored to a separate database; published app serves identical restored photo bytes and request data",
  );
  for (const statement of [
    `INSERT INTO "Ratings" ("RequestId","UserId","Stars","CreatedAt") VALUES ('AUDIT-R-1','U1',6,NOW())`,
    `INSERT INTO "Comments" ("RequestId","UserId","Text","CreatedAt") VALUES ('NO-SUCH-REQUEST','U1','Invalid reference',NOW())`,
    `INSERT INTO "Units" ("UserId","PropertyId","Name","Active") VALUES ('U1','AUDIT-P-1','Unit 1',TRUE)`,
    `UPDATE "Requests" SET "TenantId"='U2' WHERE "Id"='AUDIT-R-1'`,
  ]) {
    let rejected = false;
    try {
      sql(names.restore, "BEGIN; " + statement + "; ROLLBACK;");
    } catch {
      rejected = true;
    }
    assert.ok(rejected, "Database constraint should reject invalid data");
  }
  pass(
    "Database itself rejects invalid ratings, missing foreign keys, duplicate active units and mismatched request tenancies",
  );
} finally {
  await stop();
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify(evidence, null, 2),
  );
}
console.log(
  `${evidence.checks.length} infrastructure checks passed. Audit databases and backups remain local for inspection.`,
);
