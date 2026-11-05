# Deployment

**Live app:** https://propcare-sunx.onrender.com

## Services

| Service | Use |
| --- | --- |
| Render paid compute, Frankfurt (0.5 CPU, 512 MB, $7/month rate) | Runs the Docker image containing ASP.NET Core and the React build without idle spin-down |
| Supabase Free, Frankfurt | PostgreSQL 17 database and private photo storage |

The browser and API share one HTTPS origin. The API connects through Supabase's session pooler with a dedicated `propcare_app` role and private `propcare` schema. Database TLS verifies the hostname and the public CA certificate in `deployment/supabase-ca.crt`.

Photos are stored in the private `propcare-photos` bucket. The API checks user access before returning them; storage credentials stay on the server. Requests and photos were checked after a Render restart and remained available.

## Configuration

Set these environment variables on the Render service:

- `ConnectionStrings__PropCare`: database connection, including `Search Path=propcare`, `SSL Mode=VerifyFull` and `Root Certificate=/app/certs/supabase-ca.crt`.
- `Jwt__Key`: a randomly generated signing key of at least 32 bytes.
- `Storage__SupabaseUrl`, `Storage__ServiceKey` and `Storage__Bucket`: private storage connection.
- `ASPNETCORE_ENVIRONMENT=Production`.
- `SeedDemo=false`. Production ignores demo seeding even if an older environment value remains true. Existing records and passwords are preserved.

Keep credentials out of source control. For an empty production deployment, set `BootstrapAdmin__Email` and `BootstrapAdmin__Password`; remove the bootstrap password after the first startup. Isolated Development, Testing and Staging instances may explicitly enable demo seeding.

## Email updates

Set `Email__Enabled=true`, `Email__Host`, `Email__Port` (normally 587), `Email__From`, `Email__Username` and `Email__Password` in Render. TLS is enabled by default (`Email__UseTls=true`); disable it only for an isolated local SMTP test server. No email credentials belong in the repository.

Request events save the in-app notification and pending email in the same database transaction. A background worker claims committed messages, sends them via SMTP and records delivery. Failed attempts use exponential backoff and stop after five attempts. Admin Settings shows queued and exhausted counts and offers a retry action. Disabled accounts are skipped. Delivery is at least once: an SMTP acceptance followed by a database failure can cause a repeated email after recovery.

The integration is tested against an isolated SMTP server, including temporary delivery failure. Production uses Gmail SMTP on port 587 with TLS and an app password stored only in Render. On 5 November 2026, a live maintenance assignment generated an email that was verified in the account owner's Gmail inbox. The queue drained with zero exhausted deliveries. In-app updates continue when email is disabled.

## Staging and monitoring

The `container` CI job runs in the GitHub `staging` environment. Each run creates a private Docker network, disposable PostgreSQL database and application container using the exact checked-out revision. It checks the real image, private photos and persistence through recreation, then checks a separate Production instance to prove demo data cannot be seeded. These resources are destroyed after the run; this is an ephemeral staging environment, not a permanent public staging URL.

`monitor.yml` checks the public database-aware health endpoint, React entry page and JavaScript bundle, and OpenAPI maintenance/authentication contract every 15 minutes. It rejects an HTML fallback masquerading as a missing JavaScript bundle. It can also be dispatched manually. These read-only checks need no demonstration password and create no accounts, maintenance requests, ratings or photos. Run them directly with `APP_URL` configured and `npm run test:hosted:read-only`. Set `EXPECTED_SHA` when checking a specific release.

Failures mark the workflow red and publish recovery instructions. Enable GitHub Actions email notifications for the workflow to receive alerts outside Render/Supabase dashboards; external alert delivery has not yet been verified. GitHub scheduled runs are best effort and do not establish an uptime guarantee. The full hosted workflow check remains separate and requires an isolated demonstration environment because it creates test records.

## Releases

Feature changes go through `develop` and a release PR into `main`. Documentation fixes may go directly through a PR into `main`. Both protected branches require the `verify` and `container` checks; the approval requirement is currently zero.

After a successful main-branch CI run, `deploy.yml` sends the tested commit to Render. It waits for `/api/health` to report that revision, then checks all four roles, private photo access and the maintenance workflow. Results are saved as a GitHub Actions artifact.

GitHub needs the `APP_URL` variable, `RENDER_DEPLOY_HOOK_URL` and `HOSTED_DEMO_PASSWORD` secrets, and the `production` environment. Render's separate automatic deployment setting is off because GitHub controls deployment.

[Successful hosted release check, 5 October 2026](https://github.com/ST10445479-ConnorBettridge/INSY7315_PROPCARE_2/actions/runs/37353651170).

The SMTP release `e186a48` was manually deployed on 5 November 2026. Verification covered the exact release ID, PostgreSQL connectivity, React assets, OpenAPI, all four roles, image processing and private photo access, the complete maintenance lifecycle, rating persistence, and actual inbox delivery. Temporary verification accounts were disabled and their property and tenancy archived afterward. Credentials, generated test output and temporary verification commands are excluded from source control.

Help and individual notification controls were verified in production at `a652ca0` after [CI passed](https://github.com/ST10445479-ConnorBettridge/INSY7315_PROPCARE_2/actions/runs/42088163045). The submission source is maintained on `main`. Its required checks must pass before the main-branch release workflow deploys that exact revision; `/api/health` reports the live revision.

## Hosting limits and EXPO billing

Paid Render compute avoids idle spin-down. Supabase can still pause after a week of inactivity. Open the app before presenting and resume the database from its dashboard if necessary. This setup does not guarantee the availability or scale proposed in Part 1.

Return Render to Free on 11 November after the 10 November EXPO. The downgrade still needs successful execution; accrued paid usage can be invoiced afterward. Free Render compute can sleep after 15 idle minutes.

The required React, ASP.NET Core and PostgreSQL stack is unchanged. The deployment uses a shared web/API service and a public TLS database pooler instead of the planned separate gateway and private network. Authentication is handled by the application. Monitoring uses Render/Supabase dashboards and GitHub release checks.

Export PostgreSQL and private bucket files together for backups. Local database and photo restoration was tested; free Supabase does not include automatic database backups. Current allowances are listed by [Render](https://render.com/docs/free) and [Supabase](https://supabase.com/pricing).

To repeat the hosted check, set `APP_URL` and `DEMO_PASSWORD`, then run `node scripts/hosted-smoke.mjs`. Set `EXPECTED_SHA` to check a particular release. This creates a fictional request and photo, so use a demo environment.
