# PropCare deployment

Public application: **https://propcare-sunx.onrender.com**

The deployment keeps the required React, ASP.NET Core and PostgreSQL stack. It uses the free Render web plan in Frankfurt and a free Supabase project in the same region. No paid compute, persistent Render disk, custom domain or subscription upgrade is selected.

## Data and access

React is served by ASP.NET Core from the same HTTPS origin. Supabase hosts PostgreSQL 17 and a private `propcare-photos` object bucket. The application connects through the session pooler with a dedicated `propcare_app` role and private `propcare` schema, so application tables are not exposed through Supabase's public Data API. SSL is enforced server-side; the client verifies the certificate authority and hostname using the public CA bundled in `deployment/supabase-ca.crt`.

The CA is distributed by Supabase at https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt. It is a public trust certificate, not a private key or credential.

The API authenticates and checks request ownership before returning any image bytes. It never gives the browser the storage service key. Images are decoded, resized, stripped of metadata and rewritten as JPEGs before upload. A failed database save removes the newly uploaded object; cleanup failures are logged with the object identifier. A storage failure produces an error instead of a successful photo record.

## Release workflow

1. Open feature/fix pull requests into `develop`, then a release PR into `main`. Both branches require `verify` and `container` checks. Peer approvals are not fabricated: the configured approval count is zero, so the record demonstrates CI gating and PR use, not independent human sign-off.
2. CI builds the React and ASP.NET Core application, audits dependencies, checks migrations, tests PostgreSQL 17, exercises API access and storage failures, and runs browser/accessibility checks. A separate Docker job tests PostgreSQL 18 and persistence after container recreation.
3. A successful `main` push run triggers `Deploy and verify hosted release`. Its GitHub secret calls Render's deploy hook with the tested commit SHA. The workflow only accepts trusted repository push runs.
4. The workflow waits for the live health endpoint to report that SHA and PostgreSQL connectivity. It then checks all four roles, private photos and the complete maintenance lifecycle. Results are retained as a GitHub Actions artifact.

Required GitHub configuration: repository variable `APP_URL`; secrets `RENDER_DEPLOY_HOOK_URL` and `HOSTED_DEMO_PASSWORD`; environment `production`. Hosting credentials are set only in Render's environment, with no client-side secret variables. Fictional demonstration accounts use a separately generated hosted password, supplied privately to the project owner.

The initial public deployment and four-role smoke test passed on 5 October 2026. Refer to GitHub Actions for the result of each subsequent automatic release. A short successful run does not establish long-term availability.

## Free-plan limits and Part 1 reconciliation

| Part 1 intention | Delivered free configuration / limit |
| --- | --- |
| React, ASP.NET Core and PostgreSQL | Preserved; local PostgreSQL 18 and hosted PostgreSQL 17 are covered by checks. |
| Private cloud photo storage | Private Supabase object bucket; authorised API streams images instead of handing out expiring object URLs. |
| Encrypted data connections | Browser HTTPS; verified database TLS; HTTPS storage requests. |
| CDN and gateway | Render's managed edge and TLS serve one application origin. A separate static frontend CDN and separate API gateway are not provisioned. |
| Network isolation | Dedicated database role and unexposed schema. The hosted connection uses a public TLS pooler, not a private VPC connection. |
| Managed identity | Application bcrypt/JWT/refresh-session authentication remains in use; no external identity provider is claimed. |
| Monitoring | Render runtime/build logs, health checks, Supabase dashboard and GitHub release verification. No external log collector or 24-hour monitoring service is configured. |
| Availability and scale | Render may sleep after 15 idle minutes; a cold start can take roughly a minute. Supabase can pause after a week of inactivity. The free configuration cannot support a 99% business-hours availability guarantee or prove the proposed 5,000-property scale. |
| Backups | Local database/photo restoration was tested. Free Supabase has no automatic database backups; export PostgreSQL and private bucket files together for recovery. |

Supabase Free includes 500 MB of database space and 1 GB of object storage; Render Free includes a limited allowance of runtime/build resources. Stay within the free quotas and review the dashboards before a presentation. No artificial keep-alive traffic is configured. Current limits: [Render](https://render.com/docs/free), [Supabase](https://supabase.com/pricing).

## Reproduce the hosted smoke check

Set `APP_URL` and `DEMO_PASSWORD` for the fictional hosted demo, then run `node scripts/hosted-smoke.mjs`. Optional `EXPECTED_SHA` also checks the deployed revision. This deliberately creates one named demonstration request and photo and completes the request; do not run it against real client accounts. Evidence is saved in ignored `test-results/hosted/` without passwords or tokens.

Before recording or presenting, open the live app and wait for any cold start. If Supabase has paused, resume it from its dashboard. Keep the original local video as a fallback for connectivity problems, while identifying it as a recorded demonstration.
