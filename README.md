# PropCare

Property maintenance for Obs Realty Group. The active application uses the Part 1 stack: **React, ASP.NET Core and PostgreSQL**. It supports tenants, property managers, technicians and administrators.

## Run on this computer

From `C:\CursorProjects\PropCare`:

```powershell
npm start
```

Open **http://127.0.0.1:5124**. If the app is already running, use that address directly. The launcher starts the existing portable PostgreSQL cluster when necessary. Closing the app does not erase its database or photos.

Local configuration is in ignored `.local/settings.json`; PostgreSQL is in `.local/pgdata` and private photos in `.local/uploads`. These contain local credentials and data and must stay out of Git. The older root `.env` belongs to the archived Express implementation and is not read by the active app.

| Demo role | Email |
| --- | --- |
| Tenant | sarahwilliams@example.com |
| Property manager | michael.jacobs@obsrealty.co.za |
| Technician | johan.vdm@obsrealty.co.za |
| Administrator | admin@obsrealty.co.za |

The local fictional demo accounts use `PropCare123!`. Newly registered tenants receive no property access until an administrator verifies them and creates a **Tenant link**. Create technician accounts in **Users and roles**, then edit their specialisation under **Technicians**.

## Set up another computer

Install Node.js 22.12 or newer, the .NET 10 SDK and PostgreSQL 17 or 18. Hosted Supabase uses PostgreSQL 17; the portable local database and container check use 18. Create a database and database user for this application. The portable database and local settings on this computer are intentionally not committed.

```powershell
npm ci
npm ci --prefix frontend
dotnet tool restore
npm run build
```

Create `.local/settings.json` using the following structure, with your own database password and a randomly generated signing key of at least 32 bytes:

```json
{
  "ConnectionStrings": {
    "PropCare": "Host=127.0.0.1;Port=5432;Database=propcare;Username=propcare;Password=YOUR_DATABASE_PASSWORD"
  },
  "Jwt": { "Key": "YOUR_RANDOM_SIGNING_KEY" },
  "SeedDemo": true,
  "DemoPassword": "YOUR_DEMO_PASSWORD"
}
```

Passwords need at least ten characters, uppercase, lowercase and a number. Run `npm start`. Startup applies the checked-in EF Core migrations. Seeding happens only when the user table is empty; changing `DemoPassword` does not reset existing passwords. An administrator can reset those through the application.

For React development with hot reload, keep the API running and run `npm run dev` in another terminal. Vite serves port 5173 and proxies `/api` to port 5124. Run `npm run build` after edits to update the application served by ASP.NET Core.

## Features and structure

- Tenants register, view linked properties, report issues with photos and urgency, comment, track status, reopen completed work, confirm resolution and rate work before or after closure.
- Managers see their own property portfolio, tenants and requests; review, assign and schedule work; communicate; close completed requests; and export reports as CSV.
- Technicians see assigned work, accept or reject jobs, put work on hold, resume, record notes, upload before/after photos and mark completion.
- Administrators create and edit accounts, roles, properties, tenant links and categories; manage technician skills; reset passwords; deactivate accounts; and configure the organisation name.
- In-app notifications persist in PostgreSQL. Open views refresh when focused and every 15 seconds while visible.

```text
frontend/src/                    React views, API client and responsive styles
backend/PropCare.Api/Controllers HTTP endpoints and role requirements
backend/PropCare.Api/RequestService.cs  Maintenance business rules
backend/PropCare.Api/RequestRepository.cs Scoped queries and notification observer
backend/PropCare.Api/PropCareDb.cs       Relationships and database constraints
backend/PropCare.Api/Migrations/        Versioned PostgreSQL schema
scripts/                        API integration tests, browser tests and launcher
docs/REQUIREMENTS.md             Part 1 mapping, architecture and verification scope
legacy/express/                  Archived supplied implementation
prototype/                      Original prototype reference
```

Authentication uses bcrypt hashes, 15-minute JWT access tokens held in memory, and rotating refresh tokens in HttpOnly cookies. The server checks current account permissions and session revocation on authenticated requests. PostgreSQL foreign keys, unique indexes and check constraints protect related records; optimistic concurrency returns a conflict for competing updates. Request transitions, history and in-app notifications save in one transaction.

Photos are authenticated resources outside the web root. The server decodes JPEG, PNG and WebP images, checks size/dimensions, strips metadata and stores a resized JPEG under a generated filename. Local instances use a private directory; cloud instances use a private Supabase Storage bucket through the same authorised API. Storage credentials never reach the browser. Limits are 5 MB per input image, 20 megapixels and ten photos per request. Reference records are archived instead of deleting maintenance history.

## Verify changes

Create a separate `propcare_test` database owned by the application database user. Tests reject database connection strings whose database is not `propcare_test`. On this computer it already exists. Other environments supply `TEST_DATABASE_CONNECTION`; otherwise tests derive it from the local settings.

```powershell
npm run build
dotnet ef migrations has-pending-model-changes --project backend/PropCare.Api --configuration Release --no-build
npm test
# With the application running on port 5124:
npm run test:browser
npm run test:browser:edge-cases
npm run test:accessibility
npm audit
npm audit --prefix frontend
dotnet list backend/PropCare.Api package --vulnerable --include-transitive
```

The API tests launch their own instance on port 5125. Browser tests use fictional accounts and add uniquely named records to the running demo application; use only a demo environment. Set `PPC_BASE`, `PPC_CHROME` or `DEMO_PASSWORD` to override the browser test URL, Chromium executable or demo password. Screenshots go to ignored `test-results/browser`.

The full 5 October 2026 audit is in [docs/AUDIT-2026-10-05.md](docs/AUDIT-2026-10-05.md). Twenty API scenarios, 26 workflow checks in both Chrome and Edge, eight browser recovery/keyboard checks, and 73 accessibility/viewport scans pass. Publishing, fresh production bootstrap, database constraints and backup restoration were tested. A local exercise with 1,000 additional properties and 10,000 requests completed 200 reads/writes with zero errors and a 36 ms 95th percentile. Dependency audits report no known findings. These results do not establish hosted uptime or full manual accessibility/device conformance.

`npm run audit:infrastructure` repeats the optional local publishing, load and restore exercise using uniquely named audit databases. It requires PostgreSQL command-line tools and permission to create databases; it never drops or rewrites the application database. Audit databases/backups remain local for inspection.

## Delivery configuration

The application and deployment configuration are maintained in this repository. Hosting has not been provisioned; a successful source build does not establish a live hosted release. See the repository's Actions tab for the result of each pushed commit.

The GitHub Actions CI workflow builds the required stack against PostgreSQL 17, audits dependencies, checks migrations, runs API scenarios and exercises the browser. High and critical NuGet audit warnings fail the build. API checks also run against a controlled object-storage server to verify private photo requests, storage failures and cleanup after concurrent uploads. The Render blueprint selects the free Docker web service; PostgreSQL and photos live in a separate free Supabase project. The hosted workflow waits for `/api/health` to report the exact tested Git commit. Configure repository variable `APP_URL` and the `production` environment for the live service.

CI also builds the production Docker image in an isolated job, verifies that it runs as a non-root user, creates a maintenance request and private photo, then recreates the application container and restarts PostgreSQL. The check requires the same record, session and photo bytes to remain available. Run `node scripts/container-smoke.mjs` on a machine with Docker to reproduce it. It creates and cleans up only uniquely named test containers, networks and volumes. This verifies the container package and volume configuration; cloud uptime and HTTPS still require the hosted checks.

Hosting needs managed PostgreSQL, HTTPS and configured credentials. Set `ConnectionStrings__PropCare`, `Jwt__Key`, `Storage__SupabaseUrl`, `Storage__ServiceKey`, `Storage__Bucket` and `ASPNETCORE_ENVIRONMENT=Production`. The database connection uses a dedicated application role, private `propcare` schema, `SSL Mode=VerifyFull`, and `Root Certificate=/app/certs/supabase-ca.crt`. The bundled public CA certificate comes from Supabase's certificate distribution endpoint. The storage bucket must remain private with no anonymous read/write policies. `RENDER_GIT_COMMIT` or `RELEASE_SHA` identifies the release. The blueprint seeds fictional demo data; for an empty real deployment, set `SeedDemo=false` and provide `BootstrapAdmin__Email` and `BootstrapAdmin__Password`, then remove the bootstrap password after first startup. Back up both PostgreSQL and private bucket objects.

The selected services cost $0 within their free allowances. Render sleeps after 15 idle minutes, so the first request can take roughly a minute. Supabase includes 500 MB of database space and 1 GB of object storage and can pause after a week of inactivity. Free hosting does not establish a business-hours uptime guarantee. Open the app before a presentation and check the dashboard if a paused project needs resuming. No artificial keep-alive traffic is configured. See [Render free limits](https://render.com/docs/free) and [Supabase pricing](https://supabase.com/pricing).

Configure the host's trusted reverse-proxy addresses with `Proxy__KnownProxies__0` (and subsequent numbered entries) so client IP and HTTPS forwarding work correctly. Untrusted forwarded headers are ignored. The Part 1 CDN, object storage, private network tiers, managed identity, WAF and central monitoring design is not fully represented by the simpler Render blueprint; see the audit's alignment gaps before choosing the final hosting setup.

`Dockerfile` and `compose.yaml` are supplied as an alternative packaging path. GitHub CI verifies the production container, including persistence after recreation. Compose expects `POSTGRES_PASSWORD`, `JWT_KEY` and `DEMO_PASSWORD`; it uses persistent database and photo volumes. Do not use `docker compose down -v` if you need to retain that data.

## Source history and notices

The original source history remains intact. `upstream` points to Zulfique's source repository and `origin` to `ST10445479-ConnorBettridge/INSY7315_PROPCARE_2`. The Part 2 integration is grouped into setup, interface, workflow/data, access/administration, and testing/delivery commits. Original authors and timestamps are preserved; new commits record the current integration work. Use feature branches for subsequent changes, review them through pull requests, and check CI before merging to `main`.

The source snapshot had no top-level project licence file. Existing source notices remain, and frontend dependency licence text is included in `frontend/public/third-party-notices.txt`. Package licences also accompany their dependency distributions. The archived Express code is retained for comparison and is not built, tested or deployed by the active workflows.

The current five-person rehearsal script is in `output/documents/PropCare-Task2-Presentation-Script-Short.docx` (1,184 spoken words, targeting 12½ minutes including the demonstration).
