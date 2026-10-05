# Deployment

**Live app:** https://propcare-sunx.onrender.com

## Services

| Service | Use |
| --- | --- |
| Render Free, Frankfurt | Runs the Docker image containing ASP.NET Core and the React build |
| Supabase Free, Frankfurt | PostgreSQL 17 database and private photo storage |

The browser and API share one HTTPS origin. The API connects through Supabase's session pooler with a dedicated `propcare_app` role and private `propcare` schema. Database TLS verifies the hostname and the public CA certificate in `deployment/supabase-ca.crt`.

Photos are stored in the private `propcare-photos` bucket. The API checks user access before returning them; storage credentials stay on the server. Requests and photos were checked after a Render restart and remained available.

## Configuration

Set these environment variables on the Render service:

- `ConnectionStrings__PropCare`: database connection, including `Search Path=propcare`, `SSL Mode=VerifyFull` and `Root Certificate=/app/certs/supabase-ca.crt`.
- `Jwt__Key`: a randomly generated signing key of at least 32 bytes.
- `Storage__SupabaseUrl`, `Storage__ServiceKey` and `Storage__Bucket`: private storage connection.
- `ASPNETCORE_ENVIRONMENT=Production`.
- `SeedDemo=true` and `DemoPassword`: for an empty demonstration database. Existing account passwords are not reset by changing this value.

Keep credentials out of source control. For an empty non-demo deployment, use `SeedDemo=false` with `BootstrapAdmin__Email` and `BootstrapAdmin__Password`; remove the bootstrap password after the first startup.

## Releases

Feature changes go through `develop` and a release PR into `main`. Documentation fixes may go directly through a PR into `main`. Both protected branches require the `verify` and `container` checks; the approval requirement is currently zero.

After a successful main-branch CI run, `deploy.yml` sends the tested commit to Render. It waits for `/api/health` to report that revision, then checks all four roles, private photo access and the maintenance workflow. Results are saved as a GitHub Actions artifact.

GitHub needs the `APP_URL` variable, `RENDER_DEPLOY_HOOK_URL` and `HOSTED_DEMO_PASSWORD` secrets, and the `production` environment. Render's separate automatic deployment setting is off because GitHub controls deployment.

[Successful hosted release check, 5 October 2026](https://github.com/ST10445479-ConnorBettridge/INSY7315_PROPCARE_2/actions/runs/37353651170).

## Free-plan limits

Render can sleep after 15 idle minutes. Supabase can pause after a week of inactivity. Open the app before presenting and resume the database from its dashboard if necessary. The free plans do not guarantee the availability or scale proposed in Part 1.

The required React, ASP.NET Core and PostgreSQL stack is unchanged. The free deployment uses a shared web/API service and a public TLS database pooler instead of the planned separate gateway and private network. Authentication is handled by the application. Monitoring uses Render/Supabase dashboards and GitHub release checks.

Export PostgreSQL and private bucket files together for backups. Local database and photo restoration was tested; free Supabase does not include automatic database backups. Current allowances are listed by [Render](https://render.com/docs/free) and [Supabase](https://supabase.com/pricing).

To repeat the hosted check, set `APP_URL` and `DEMO_PASSWORD`, then run `node scripts/hosted-smoke.mjs`. Set `EXPECTED_SHA` to check a particular release. This creates a fictional request and photo, so use a demo environment.
