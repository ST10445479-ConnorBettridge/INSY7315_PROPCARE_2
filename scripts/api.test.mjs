import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, createWriteStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const base = "http://127.0.0.1:5125";
const root = resolve(import.meta.dirname, "..");
const local = existsSync(resolve(root, ".local/settings.json"))
  ? JSON.parse(readFileSync(resolve(root, ".local/settings.json")))
  : {};
const connection =
  process.env.TEST_DATABASE_CONNECTION ||
  local.ConnectionStrings?.PropCare?.replace(
    "Database=propcare;",
    "Database=propcare_test;",
  );
assert.ok(
  connection && /Database=propcare_test[;\s]/i.test(connection + ";"),
  "Tests require an explicit propcare_test database.",
);
const suffix = Date.now();
const password = "PropCare123!";
let server, log;
let storageServer, storageUrl, failStorage = false;
const remoteStorage = process.env.TEST_REMOTE_STORAGE === "true";
const storedPhotos = new Map();
const tokens = {};
async function call(path, method = "GET", body, token, cookie) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-PropCare": "1",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    body: await r.json().catch(() => ({})),
    cookie: r.headers.getSetCookie()[0]?.split(";")[0],
    headers: r.headers,
  };
}
async function ok(path, method, body, token, status = 200) {
  const r = await call(path, method, body, token);
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body.data ?? r.body;
}
before(
  async () => {
    if (remoteStorage) {
      storageServer = createServer(async (req, res) => {
        if (req.headers.authorization !== "Bearer test-storage-key" || req.headers.apikey !== "test-storage-key") { res.writeHead(401).end(); return; }
        if (failStorage) { res.writeHead(503).end(); return; }
        const name = req.url;
        assert.match(name, /^\/storage\/v1\/object\/propcare-photos\/[a-zA-Z0-9]+\.jpg$/);
        if (req.method === "POST") {
          assert.equal(req.headers["content-type"], "image/jpeg");
          const chunks=[];for await (const chunk of req) chunks.push(chunk);
          storedPhotos.set(name,Buffer.concat(chunks));
          await new Promise(resolve=>setTimeout(resolve,25));
          res.writeHead(200).end('{}');
        } else if (req.method === "DELETE") { storedPhotos.delete(name);res.writeHead(200).end('{}'); }
        else if (storedPhotos.has(name)) res.writeHead(200,{'Content-Type':'image/jpeg'}).end(storedPhotos.get(name));
        else res.writeHead(404).end('{}');
      });
      await new Promise(resolve=>storageServer.listen(0,'127.0.0.1',resolve));
      storageUrl=`http://127.0.0.1:${storageServer.address().port}`;
    }
    log = createWriteStream(resolve(root, ".local-api-test.log"));
    server = spawn(
      "dotnet",
      [
        resolve(
          root,
          "backend/PropCare.Api/bin/Release/net10.0/PropCare.Api.dll",
        ),
        "--urls",
        base,
      ],
      {
        cwd: resolve(root, "backend/PropCare.Api"),
        env: {
          ...process.env,
          ASPNETCORE_ENVIRONMENT: "Testing",
          ConnectionStrings__PropCare: connection,
          Jwt__Key: "integration-test-signing-key-only-at-least-32-bytes",
          SeedDemo: "true",
          DemoPassword: password,
          Storage__Path: resolve(root, ".local/test-uploads"),
          Storage__SupabaseUrl: storageUrl || "",
          Storage__ServiceKey: remoteStorage ? "test-storage-key" : "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.pipe(log);
    server.stderr.pipe(log);
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(base + "/api/health");
        if (r.ok) break;
      } catch {}
      if (server.exitCode !== null)
        throw new Error("Test API exited. Read .local-api-test.log.");
      await new Promise((r) => setTimeout(r, 200));
    }
    for (const [role, email] of Object.entries({
      tenant: "sarahwilliams@example.com",
      manager: "michael.jacobs@obsrealty.co.za",
      technician: "johan.vdm@obsrealty.co.za",
      admin: "admin@obsrealty.co.za",
    })) {
      tokens[role] = (
        await ok("/auth/login", "POST", { email, password })
      ).token;
    }
  },
  { timeout: 60000 },
);
after(() => {
  server?.kill();
  storageServer?.close();
  log?.end();
});

test("PostgreSQL health, authentication and role isolation", async () => {
  const health = await call("/health");
  assert.equal(health.body.database, "PostgreSQL");
  assert.equal((await call("/requests")).status, 401);
  assert.equal(
    (await call("/users", "GET", undefined, tokens.tenant)).status,
    403,
  );
  assert.equal(
    (await call("/requests/REQ-1032", "GET", undefined, tokens.tenant)).status,
    404,
  );
  assert.equal(
    (await call("/requests/REQ-1027", "GET", undefined, tokens.manager)).status,
    404,
  );
  const tenants = await ok("/tenants", "GET", undefined, tokens.manager);
  assert.ok(!tenants.some((u) => u.email === "priya.naidoo@example.com"));
  assert.equal(
    (
      await call(
        "/categories",
        "POST",
        { name: "Bad", active: true },
        tokens.tenant,
      )
    ).status,
    403,
  );
  assert.match(
    health.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
});

test("tenant registration cannot choose an elevated role and needs a verified unit", async () => {
  const email = `registration-${suffix}@example.com`;
  await ok(
    "/auth/register",
    "POST",
    { name: "Registration Test", email, password, role: "admin" },
    undefined,
    201,
  );
  const login = await ok("/auth/login", "POST", { email, password });
  assert.equal(login.user.role, "tenant");
  assert.deepEqual(await ok("/units", "GET", undefined, login.token), []);
  assert.equal(
    (
      await call(
        "/requests",
        "POST",
        {
          title: "Test",
          detail: "Test issue",
          unitId: 1,
          categoryId: "plumbing",
          urgency: "normal",
        },
        login.token,
      )
    ).status,
    400,
  );
});

test("admin onboarding and full request lifecycle, including rating after closure", async () => {
  const admin = tokens.admin;
  const category = await ok(
    "/categories",
    "POST",
    { name: "Test category " + suffix, active: true },
    admin,
    201,
  );
  await ok(
    "/categories/" + category.id,
    "PUT",
    { name: "Custom repairs " + suffix, active: true },
    admin,
  );
  const property = await ok(
    "/properties",
    "POST",
    {
      name: "Test building " + suffix,
      address: "1 Example Street",
      area: "Claremont",
      managerId: "U2",
      active: true,
    },
    admin,
    201,
  );
  const tenant = await ok(
    "/users",
    "POST",
    {
      name: "Workflow Tenant",
      email: `flow-${suffix}@example.com`,
      password,
      role: "tenant",
      active: true,
    },
    admin,
    201,
  );
  const unit = await ok(
    "/units",
    "POST",
    {
      name: "Unit 5",
      userId: tenant.id,
      propertyId: property.id,
      active: true,
    },
    admin,
    201,
  );
  const login = await ok("/auth/login", "POST", {
    email: tenant.email,
    password,
  });
  const request = await ok(
    "/requests",
    "POST",
    {
      title: "Tap needs repair",
      detail: "Water under the sink.",
      unitId: unit.id,
      categoryId: category.id,
      urgency: "high",
    },
    login.token,
    201,
  );
  assert.equal(
    (
      await call(
        "/requests/" + request.id + "/status",
        "POST",
        { action: "approve" },
        tokens.manager,
      )
    ).status,
    400,
  );
  const scheduledAt = new Date(Date.now() + 86400000).toISOString();
  await ok(
    "/requests/" + request.id + "/assign",
    "POST",
    {
      technicianId: "T1",
      urgency: "high",
      scheduledAt,
      note: "Bring a washer",
    },
    tokens.manager,
  );
  await ok(
    "/requests/" + request.id + "/status",
    "POST",
    { action: "accept" },
    tokens.technician,
  );
  await ok(
    "/requests/" + request.id + "/status",
    "POST",
    { action: "hold", note: "Waiting for parts" },
    tokens.technician,
  );
  await ok(
    "/requests/" + request.id + "/status",
    "POST",
    { action: "resume" },
    tokens.technician,
  );
  await ok(
    "/requests/" + request.id + "/comments",
    "POST",
    { text: "<script>alert(1)</script> is stored as text" },
    login.token,
  );
  await ok(
    "/requests/" + request.id + "/status",
    "POST",
    { action: "complete", note: "Washer replaced" },
    tokens.technician,
  );
  await ok(
    "/requests/" + request.id + "/status",
    "POST",
    { action: "reopen", note: "Still leaking" },
    login.token,
  );
  await ok(
    "/requests/" + request.id + "/status",
    "POST",
    { action: "complete", note: "Valve repaired" },
    tokens.technician,
  );
  await ok(
    "/requests/" + request.id + "/status",
    "POST",
    { action: "confirm" },
    login.token,
  );
  await ok(
    "/requests/" + request.id + "/rate",
    "POST",
    { stars: 5 },
    login.token,
  );
  assert.equal(
    (
      await call(
        "/requests/" + request.id + "/rate",
        "POST",
        { stars: 3 },
        login.token,
      )
    ).status,
    409,
  );
  const detail = await ok(
    "/requests/" + request.id,
    "GET",
    undefined,
    login.token,
  );
  assert.equal(detail.request.status, "closed");
  assert.equal(detail.rating, 5);
  assert.equal(detail.history.length, 9);
  assert.ok(detail.comments.some((c) => c.text.startsWith("<script>")));
  assert.ok(
    (await ok("/notifications", "GET", undefined, login.token)).some(
      (n) => n.requestId === request.id,
    ),
  );
  assert.equal(
    (
      await call(
        "/units/" + unit.id,
        "PUT",
        {
          name: "Unit 9",
          userId: tenant.id,
          propertyId: property.id,
          active: true,
        },
        admin,
      )
    ).status,
    409,
  );
  const reports = await ok("/reports", "GET", undefined, tokens.manager);
  assert.ok(
    reports.byCategory.some((c) => c.name === "Custom repairs " + suffix),
  );
});

test("photo upload validates actual images, authorises access and preserves before and after types", async () => {
  const request = await ok(
    "/requests",
    "POST",
    {
      title: "Photo test",
      detail: "Image validation",
      unitId: 1,
      categoryId: "plumbing",
      urgency: "normal",
    },
    tokens.tenant,
    201,
  );
  const png = readFileSync(
    resolve(root, "scripts/fixtures/repair.png"),
  ).toString("base64");
  // The image is decoded and rewritten; a fake MIME label or signature is insufficient.
  assert.equal(
    (
      await call(
        "/requests/" + request.id + "/photos",
        "POST",
        {
          filename: "fake.png",
          kind: "issue",
          data: Buffer.from("not an image").toString("base64"),
        },
        tokens.tenant,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/requests/" + request.id + "/photos",
        "POST",
        { filename: "test.png", kind: "after", data: png },
        tokens.tenant,
      )
    ).status,
    400,
  );
  await ok(
    "/requests/" + request.id + "/photos",
    "POST",
    { filename: "test.png", kind: "issue", data: png },
    tokens.tenant,
    201,
  );
  const detail = await ok(
    "/requests/" + request.id,
    "GET",
    undefined,
    tokens.tenant,
  );
  assert.equal(detail.photos[0].kind, "issue");
  const response = await fetch(
    base + `/api/requests/${request.id}/photos/${detail.photos[0].id}`,
    { headers: { Authorization: "Bearer " + tokens.tenant } },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes[0], 255);
  assert.equal(bytes[1], 216);
});

test("refresh rotates the cookie; logout revokes access tokens", async () => {
  const login = await call("/auth/login", "POST", {
    email: "sarahwilliams@example.com",
    password,
  });
  assert.ok(login.cookie);
  const refresh = await call(
    "/auth/refresh",
    "POST",
    undefined,
    undefined,
    login.cookie,
  );
  assert.equal(refresh.status, 200);
  assert.notEqual(refresh.cookie, login.cookie);
  assert.equal(
    (await call("/auth/refresh", "POST", undefined, undefined, login.cookie))
      .status,
    401,
  );
  await call("/auth/logout", "POST", undefined, undefined, refresh.cookie);
  assert.equal(
    (await call("/auth/me", "GET", undefined, refresh.body.data.token)).status,
    401,
  );
  const csrf = await fetch(base + "/api/auth/refresh", {
    method: "POST",
    headers: { Cookie: refresh.cookie },
  });
  assert.equal(csrf.status, 403);
});

test("role changes and deactivation take effect for an existing token", async () => {
  const input = {
    name: "Access Test",
    email: `access-${suffix}@example.com`,
    password,
    role: "tenant",
    active: true,
  };
  const u = await ok("/users", "POST", input, tokens.admin, 201);
  const login = await ok("/auth/login", "POST", {
    email: input.email,
    password,
  });
  await ok(
    "/users/" + u.id,
    "PUT",
    { ...input, password: "", role: "manager" },
    tokens.admin,
  );
  assert.equal(
    (await ok("/auth/me", "GET", undefined, login.token)).user.role,
    "manager",
  );
  await ok(
    "/users/" + u.id,
    "PUT",
    { ...input, password: "", role: "manager", active: false },
    tokens.admin,
  );
  assert.equal(
    (await call("/auth/me", "GET", undefined, login.token)).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/users/U14",
        "PUT",
        {
          name: "System Admin",
          email: "admin@obsrealty.co.za",
          role: "tenant",
          active: false,
        },
        tokens.admin,
      )
    ).status,
    400,
  );
});

test("failed logins lock an account and a password reset clears the lock", async () => {
  const input = {
    name: "Lockout Test",
    email: `lock-${suffix}@example.com`,
    password,
    role: "tenant",
    active: true,
  };
  const u = await ok("/users", "POST", input, tokens.admin, 201);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await call("/auth/login", "POST", {
          email: input.email,
          password: "wrong",
        })
      ).status,
      401,
    );
  assert.equal(
    (await call("/auth/login", "POST", { email: input.email, password }))
      .status,
    429,
  );
  await ok("/users/" + u.id, "PUT", input, tokens.admin);
  assert.equal(
    (await call("/auth/login", "POST", { email: input.email, password }))
      .status,
    200,
  );
});

async function newRequest(title = "Audit request") {
  return ok(
    "/requests",
    "POST",
    {
      title: title + " " + suffix,
      detail: "A maintenance issue for regression testing.",
      unitId: 1,
      categoryId: "plumbing",
      urgency: "normal",
    },
    tokens.tenant,
    201,
  );
}
async function assignRequest(request) {
  return ok(
    `/requests/${request.id}/assign`,
    "POST",
    {
      technicianId: "T1",
      urgency: "high",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
    },
    tokens.manager,
  );
}
test("all administrative write endpoints reject tenant, manager and technician callers", async () => {
  for (const role of ["tenant", "manager", "technician"])
    for (const [path, method, body] of [
      [
        "/users",
        "POST",
        {
          name: "Forbidden",
          email: "forbidden@example.com",
          password,
          role: "admin",
          active: true,
        },
      ],
      [
        "/users/U14",
        "PUT",
        {
          name: "Forbidden",
          email: "forbidden@example.com",
          password,
          role: "admin",
          active: true,
        },
      ],
      [
        "/properties",
        "POST",
        {
          name: "Forbidden",
          address: "Address",
          area: "Area",
          managerId: "U2",
        },
      ],
      [
        "/properties/P1",
        "PUT",
        {
          name: "Forbidden",
          address: "Address",
          area: "Area",
          managerId: "U2",
        },
      ],
      ["/units", "POST", { name: "Forbidden", userId: "U1", propertyId: "P1" }],
      [
        "/units/1",
        "PUT",
        { name: "Forbidden", userId: "U1", propertyId: "P1" },
      ],
      ["/categories", "POST", { name: "Forbidden" }],
      ["/categories/plumbing", "PUT", { name: "Forbidden" }],
      ["/technicians/T1", "PUT", { userId: "U3", skill: "Forbidden" }],
      ["/settings", "PUT", { orgName: "Forbidden" }],
    ])
      assert.equal(
        (await call(path, method, body, tokens[role])).status,
        403,
        role + " " + method + " " + path,
      );
});
test("registration and request validation reject malformed and out-of-range input", async () => {
  for (const body of [
    null,
    {},
    { name: "Valid Name", email: "invalid", password },
    { name: "Valid Name", email: "valid@example.com", password: "weak" },
    { name: "   ", email: "valid@example.com", password },
  ])
    assert.equal((await call("/auth/register", "POST", body)).status, 400);
  for (const change of [
    { title: "" },
    { title: " ".repeat(5) },
    { title: "a".repeat(121) },
    { detail: "a".repeat(2001) },
    { unitId: 0 },
    { categoryId: "missing" },
    { urgency: "nuclear" },
  ])
    assert.equal(
      (
        await call(
          "/requests",
          "POST",
          {
            title: "Valid",
            detail: "Valid details",
            unitId: 1,
            categoryId: "plumbing",
            urgency: "normal",
            ...change,
          },
          tokens.tenant,
        )
      ).status,
      400,
    );
  assert.equal(
    (await call("/auth/login", "POST", { email: "' OR 1=1 --", password }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: "unknown-audit@example.com",
        password,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: "unknown-audit@example.com",
        password: "é".repeat(40),
      })
    ).status,
    400,
  );
  const r = await newRequest();
  for (const stars of [0, 6, -1, 1.5])
    assert.equal(
      (await call(`/requests/${r.id}/rate`, "POST", { stars }, tokens.tenant))
        .status,
      400,
    );
  assert.equal((await call("/not-a-real-resource")).status, 404);
});
test("cancel, review, rejection, reassignment, scheduling and manager closure follow the state machine", async () => {
  const cancel = await newRequest("Cancel audit");
  await ok(
    `/requests/${cancel.id}/status`,
    "POST",
    { action: "cancel" },
    tokens.tenant,
  );
  assert.equal(
    (
      await call(
        `/requests/${cancel.id}/assign`,
        "POST",
        { technicianId: "T1", urgency: "normal" },
        tokens.manager,
      )
    ).status,
    403,
  );
  const r = await newRequest("Reject audit");
  await ok(
    `/requests/${r.id}/status`,
    "POST",
    { action: "review" },
    tokens.manager,
  );
  await ok(
    `/requests/${r.id}/status`,
    "POST",
    { action: "reject" },
    tokens.manager,
  );
  await assignRequest(r);
  await ok(
    `/requests/${r.id}/status`,
    "POST",
    { action: "reject", note: "Unavailable" },
    tokens.technician,
  );
  await assignRequest(r);
  assert.equal(
    (
      await call(
        `/requests/${r.id}/assign`,
        "POST",
        {
          technicianId: "T1",
          urgency: "normal",
          scheduledAt: "2000-01-01T12:00:00Z",
        },
        tokens.manager,
      )
    ).status,
    400,
  );
  await ok(
    `/requests/${r.id}/status`,
    "POST",
    { action: "accept" },
    tokens.technician,
  );
  assert.equal(
    (
      await call(
        `/requests/${r.id}/status`,
        "POST",
        { action: "confirm" },
        tokens.tenant,
      )
    ).status,
    400,
  );
  await ok(
    `/requests/${r.id}/status`,
    "POST",
    { action: "complete" },
    tokens.technician,
  );
  await ok(
    `/requests/${r.id}/status`,
    "POST",
    { action: "approve" },
    tokens.manager,
  );
  assert.equal(
    (await ok(`/requests/${r.id}`, "GET", undefined, tokens.tenant)).request
      .status,
    "closed",
  );
});
test("private photos require request access and preserve technician before and after evidence", async () => {
  const r = await newRequest("Evidence audit");
  await assignRequest(r);
  const data = readFileSync(
    resolve(root, "scripts/fixtures/repair.png"),
  ).toString("base64");
  for (const kind of ["before", "after"])
    await ok(
      `/requests/${r.id}/photos`,
      "POST",
      { filename: "repair.png", kind, data },
      tokens.technician,
      201,
    );
  const d = await ok(`/requests/${r.id}`, "GET", undefined, tokens.tenant);
  assert.deepEqual(d.photos.map((p) => p.kind).sort(), ["after", "before"]);
  const other = await ok("/auth/login", "POST", {
    email: "priya.naidoo@example.com",
    password,
  });
  const photoPath = `/requests/${r.id}/photos/${d.photos[0].id}`;
  assert.equal((await call(photoPath)).status, 401);
  assert.equal(
    (await call(photoPath, "GET", undefined, other.token)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/requests/${r.id}/comments`,
        "POST",
        { text: "Not mine" },
        other.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/requests/${r.id}/photos`,
        "POST",
        { filename: "repair.png", kind: "issue", data },
        other.token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/requests/${r.id}/photos`,
        "POST",
        { filename: "repair.png", kind: "issue", data: "invalid-base64" },
        tokens.tenant,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        `/requests/${r.id}/photos`,
        "POST",
        {
          filename: "repair.png",
          kind: "issue",
          data: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
        },
        tokens.tenant,
      )
    ).status,
    413,
  );
});
test("parallel photo uploads cannot exceed ten attachments", async () => {
  const r = await newRequest("Photo concurrency");
  const body = {
    filename: "repair.png",
    kind: "issue",
    data: readFileSync(resolve(root, "scripts/fixtures/repair.png")).toString(
      "base64",
    ),
  };
  for (let i = 0; i < 9; i++)
    await ok(`/requests/${r.id}/photos`, "POST", body, tokens.tenant, 201);
  const uploads = await Promise.all(
    Array.from({ length: 5 }, () =>
      call(`/requests/${r.id}/photos`, "POST", body, tokens.tenant),
    ),
  );
  assert.equal(uploads.filter((r) => r.status === 201).length, 1);
  assert.ok(uploads.every((r) => [201, 400, 409].includes(r.status)));
  assert.equal(
    (await ok(`/requests/${r.id}`, "GET", undefined, tokens.tenant)).photos
      .length,
    10,
  );
});
test("remote storage failure leaves no photo metadata; conflicting uploads leave no orphan objects", {skip: !remoteStorage}, async () => {
  // Earlier scenarios save 1 issue photo, 2 technician photos, and exactly 10 concurrent-limit photos.
  assert.equal(storedPhotos.size,13);
  const request=await newRequest("Storage recovery");
  const input={filename:'repair.png',kind:'issue',data:readFileSync(resolve(root,'scripts/fixtures/repair.png')).toString('base64')};
  failStorage=true;
  try { assert.equal((await call(`/requests/${request.id}/photos`,'POST',input,tokens.tenant)).status,503); }
  finally { failStorage=false; }
  assert.equal((await ok(`/requests/${request.id}`,'GET',undefined,tokens.tenant)).photos.length,0);
  assert.equal(storedPhotos.size,13);
  await ok(`/requests/${request.id}/photos`,'POST',input,tokens.tenant,201);
  const detail=await ok(`/requests/${request.id}`,'GET',undefined,tokens.tenant);
  assert.equal(storedPhotos.size,14);
  failStorage=true;
  try { assert.equal((await call(`/requests/${request.id}/photos/${detail.photos[0].id}`,'GET',undefined,tokens.tenant)).status,503); }
  finally { failStorage=false; }
});

test("concurrent refresh attempts never set a cookie for a failed rotation", async () => {
  const login = await call("/auth/login", "POST", {
    email: "sarahwilliams@example.com",
    password,
  });
  const rotations = await Promise.all(
    Array.from({ length: 8 }, () =>
      call("/auth/refresh", "POST", undefined, undefined, login.cookie),
    ),
  );
  assert.equal(rotations.filter((r) => r.status === 200).length, 1);
  for (const r of rotations.filter((r) => r.status !== 200))
    assert.equal(
      Boolean(r.cookie),
      false,
      `Failed rotation ${r.status} set a cookie`,
    );
  const winner = rotations.find((r) => r.status === 200);
  assert.equal(
    (await call("/auth/refresh", "POST", undefined, undefined, winner.cookie))
      .status,
    200,
  );
});
test("profile changes require the password and a reset revokes every session", async () => {
  const input = {
    name: "Profile Audit",
    email: `profile-${suffix}@example.com`,
    password,
    role: "tenant",
    active: true,
  };
  await ok("/users", "POST", input, tokens.admin, 201);
  const first = await call("/auth/login", "POST", {
    email: input.email,
    password,
  });
  const second = await call("/auth/login", "POST", {
    email: input.email,
    password,
  });
  const body = {
    name: "Updated Profile",
    email: input.email,
    password: "NewPassword123!",
  };
  assert.equal(
    (await call("/profile", "PUT", body, first.body.data.token)).status,
    400,
  );
  await ok(
    "/profile",
    "PUT",
    { ...body, currentPassword: password },
    first.body.data.token,
  );
  for (const session of [first, second]) {
    assert.equal(
      (await call("/auth/me", "GET", undefined, session.body.data.token))
        .status,
      401,
    );
    assert.equal(
      (
        await call(
          "/auth/refresh",
          "POST",
          undefined,
          undefined,
          session.cookie,
        )
      ).status,
      401,
    );
  }
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: input.email,
        password: "NewPassword123!",
      })
    ).status,
    200,
  );
});
test("settings, technician records, duplicate identities and read notifications persist", async () => {
  const original = await ok("/settings", "GET", undefined, tokens.admin);
  await ok("/settings", "PUT", { orgName: "Audit workspace" }, tokens.admin);
  assert.equal(
    (await ok("/settings", "GET", undefined, tokens.tenant)).orgName,
    "Audit workspace",
  );
  await ok("/settings", "PUT", original, tokens.admin);
  const input = {
    name: "Audit Technician",
    email: `technician-${suffix}@example.com`,
    password,
    role: "technician",
    active: true,
  };
  const user = await ok("/users", "POST", input, tokens.admin, 201);
  assert.equal(
    (
      await call(
        "/users",
        "POST",
        { ...input, email: input.email.toUpperCase() },
        tokens.admin,
      )
    ).status,
    409,
  );
  const technician = (
    await ok("/technicians", "GET", undefined, tokens.admin)
  ).find((t) => t.userId === user.id);
  assert.ok(technician);
  await ok(
    "/technicians/" + technician.id,
    "PUT",
    { userId: user.id, skill: "Electrical repairs" },
    tokens.admin,
  );
  assert.equal(
    (await ok("/technicians", "GET", undefined, tokens.admin)).find(
      (t) => t.id === technician.id,
    ).skill,
    "Electrical repairs",
  );
  await ok("/notifications/read", "POST", undefined, tokens.tenant);
  assert.ok(
    (await ok("/notifications", "GET", undefined, tokens.tenant)).every(
      (n) => n.read,
    ),
  );
});

test("logout revokes its authenticated session even when the cookie has just rotated", async () => {
  const login = await call("/auth/login", "POST", {
    email: "sarahwilliams@example.com",
    password,
  });
  const refresh = await call(
    "/auth/refresh",
    "POST",
    undefined,
    undefined,
    login.cookie,
  );
  await call(
    "/auth/logout",
    "POST",
    undefined,
    login.body.data.token,
    login.cookie,
  );
  assert.equal(
    (await call("/auth/me", "GET", undefined, refresh.body.data.token)).status,
    401,
  );
  assert.equal(
    (await call("/auth/refresh", "POST", undefined, undefined, refresh.cookie))
      .status,
    401,
  );
});
test("request pagination, search, overview and schedule retain complete scoped counts", async () => {
  const search = "Pagination audit " + suffix;
  for (let i = 0; i < 3; i++) await newRequest(search + " " + i);
  const first = await ok(
    "/requests/page?page=1&pageSize=2&q=" + encodeURIComponent(search),
    "GET",
    undefined,
    tokens.tenant,
  );
  const next = await ok(
    "/requests/page?page=2&pageSize=2&q=" + encodeURIComponent(search),
    "GET",
    undefined,
    tokens.tenant,
  );
  assert.equal(first.total, 3);
  assert.equal(first.items.length, 2);
  assert.equal(next.items.length, 1);
  assert.equal(
    new Set([...first.items, ...next.items].map((r) => r.id)).size,
    3,
  );
  const manager = await ok(
    "/requests/page?pageSize=1",
    "GET",
    undefined,
    tokens.manager,
  );
  const overview = await ok(
    "/requests/overview",
    "GET",
    undefined,
    tokens.manager,
  );
  assert.equal(overview.total, manager.total);
  assert.ok(overview.recent.length <= 6);
  const scheduled = await ok(
    "/requests/scheduled",
    "GET",
    undefined,
    tokens.technician,
  );
  assert.ok(scheduled.every((r) => r.technicianId === "T1" && r.scheduledAt));
  for (const query of ["page=0", "pageSize=0", "pageSize=101", "page=-1"])
    assert.equal(
      (await call("/requests/page?" + query, "GET", undefined, tokens.tenant))
        .status,
      400,
    );
  const literal = await ok(
    "/requests/page?q=" + encodeURIComponent("%_"),
    "GET",
    undefined,
    tokens.tenant,
  );
  assert.equal(literal.total, 0);
});
test("an archived tenancy can be ended even when the account has been disabled", async () => {
  const input = {
    name: "Archive Tenant",
    email: `archive-${suffix}@example.com`,
    password,
    role: "tenant",
    active: true,
  };
  const tenant = await ok("/users", "POST", input, tokens.admin, 201);
  const link = {
    name: "Audit unit " + suffix,
    userId: tenant.id,
    propertyId: "P1",
    active: true,
  };
  const unit = await ok("/units", "POST", link, tokens.admin, 201);
  assert.equal((await call("/units", "POST", link, tokens.admin)).status, 409);
  await ok(
    "/users/" + tenant.id,
    "PUT",
    { ...input, password: "", active: false },
    tokens.admin,
  );
  await ok(
    "/units/" + unit.id,
    "PUT",
    { ...link, active: false },
    tokens.admin,
  );
  assert.equal(
    (await ok("/units", "GET", undefined, tokens.admin)).find(
      (u) => u.id === unit.id,
    ).active,
    false,
  );
});

test("reports keep distinct properties and technicians that share a name", async () => {
  const sharedName = "Shared audit name " + suffix,
    created = [];
  for (let i = 0; i < 2; i++) {
    const p = await ok(
      "/properties",
      "POST",
      {
        name: sharedName,
        address: "Audit address",
        area: "Audit area",
        managerId: "U2",
        active: true,
      },
      tokens.admin,
      201,
    );
    const unit = await ok(
      "/units",
      "POST",
      { name: "Unit 1", propertyId: p.id, userId: "U1", active: true },
      tokens.admin,
      201,
    );
    const r = await ok(
      "/requests",
      "POST",
      {
        title: "Duplicate-name report audit",
        detail: "Audit",
        unitId: unit.id,
        categoryId: "plumbing",
        urgency: "normal",
      },
      tokens.tenant,
      201,
    );
    const u = await ok(
      "/users",
      "POST",
      {
        name: sharedName,
        email: `same-name-${i}-${suffix}@example.com`,
        password,
        role: "technician",
        active: true,
      },
      tokens.admin,
      201,
    );
    const t = (await ok("/technicians", "GET", undefined, tokens.admin)).find(
      (t) => t.userId === u.id,
    );
    const login = await ok("/auth/login", "POST", { email: u.email, password });
    created.push({ p, r, t, token: login.token });
  }
  const open = (
    await ok("/reports", "GET", undefined, tokens.manager)
  ).byProperty.filter((p) => p.name === sharedName);
  assert.equal(open.length, 2);
  assert.equal(new Set(open.map((p) => p.id)).size, 2);
  for (const { r, t, token } of created) {
    await ok(
      `/requests/${r.id}/assign`,
      "POST",
      { technicianId: t.id, urgency: "normal" },
      tokens.manager,
    );
    await ok(`/requests/${r.id}/status`, "POST", { action: "accept" }, token);
    await ok(`/requests/${r.id}/status`, "POST", { action: "complete" }, token);
  }
  const techs = (
    await ok("/reports", "GET", undefined, tokens.manager)
  ).technicians.filter((t) => t.name === sharedName);
  assert.equal(techs.length, 2);
  assert.ok(techs.every((t) => t.completed === 1));
});
test("invalid signatures, expired tokens, wrong issuer and audience are rejected", async () => {
  const [header, payload] = tokens.tenant.split("."),
    original = JSON.parse(Buffer.from(payload, "base64url"));
  function sign(claims) {
    const input =
      header + "." + Buffer.from(JSON.stringify(claims)).toString("base64url");
    return (
      input +
      "." +
      createHmac(
        "sha256",
        "integration-test-signing-key-only-at-least-32-bytes",
      )
        .update(input)
        .digest("base64url")
    );
  }
  for (const token of [
    header + "." + payload + ".invalid",
    sign({ ...original, exp: Math.floor(Date.now() / 1000) - 60 }),
    sign({ ...original, iss: "other-system" }),
    sign({ ...original, aud: "other-api" }),
  ])
    assert.equal((await call("/auth/me", "GET", undefined, token)).status, 401);
});
