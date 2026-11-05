# Task 3 feedback response

This revision addresses the Task 2 feedback against the existing React, ASP.NET Core and PostgreSQL implementation. It preserves the maintenance lifecycle and authorisation rules while improving organisation, documentation, verification and production configuration.

| Feedback criterion | Implemented response | Evidence or remaining limit |
| --- | --- | --- |
| Visual design and branding | Styles separated into base, shell, shared controls, feature and responsive files. | Browser workflows pass and production assets build. |
| UX and feedback | Feature views and shared controls extracted; notifications support individual read actions and an unread filter with recoverable errors; Help provides guides tailored to each role. | 30 browser workflows and 9 keyboard/error recovery checks pass. |
| Responsiveness and accessibility | Mobile dialog/touch/overflow rules, explicit navigation relationship and form/dialog semantics; scans cover all role routes, Help and request details. | 161 page/viewport scans pass with no automated violations or overflow. Manual screen-reader and physical-device verification remain separate. |
| Programming skills | Removed obsolete Express/prototype code from the active tree; retained it in Git history. | Current stack only in the working source tree; regression checks cover the extracted views. |
| Database | Preserved tenancy and existing integrity rules; added email delivery status, queue index and bounded-attempt constraint through a migration. | Model/migration consistency and API storage checks. |
| APIs | Individual entity files and generated OpenAPI; private individual notification updates and unread filtering. | Tests check authentication, documentation, idempotent reads and rejection of cross-account updates. |
| Security | Updated vulnerable npm tooling; replaced ImageSharp with Magick.NET; production cannot run demo seeding even if an old flag is true. | npm and NuGet audits report no vulnerable packages; production bootstrap is checked in the container job. |
| Data flow and logic | Transactional pending email notifications with scoped recipients, claims, retries, delivery state and administrator recovery action. | Controlled SMTP failure/recovery tests pass. Production Gmail SMTP is configured; an app-generated maintenance email reached the owner's inbox and the queue drained with zero exhausted deliveries on 5 November. |
| Deployment and connectivity | Paid always-on Render compute enabled; production blueprint disables seeding. | SMTP release `e186a48` deployed and verified on 5 November. Help and individual notification controls are included on `task3-improvements`; deploy its exact commit after CI passes. |
| Stability and rationale | Scheduled read-only checks cover the database, React entry point, JavaScript bundle and OpenAPI contract. | Regression checks reject broken HTML/bundles and prove that readiness checks create no maintenance records. |
| Branching and workflow | Changes developed on a feature/fix branch and released through protected checks. | Actual team contributions must be evidenced honestly; no history or contribution counts are fabricated. |
| CI CD and pipelines | Isolated disposable container/database staging environment before production release; extra SMTP, OpenAPI and production seeding checks. | This staging environment is temporary, not a permanent public staging URL. |
| Technical demonstration | User guide gives the four-role maintenance demonstration and preserves the working lifecycle. | Rehearse the deployed final revision before the EXPO. |
| Architecture and system design | API and deployment guides explain transactions, SMTP separation, security, staging and hosting limits. | Speakers must defend these decisions using the actual implementation. |
| GitHub presentation | CI, protected PR and release revision provide concrete material to show. | Add an explicit GitHub segment to the EXPO presentation. |
| Requirements alignment | Existing user-story mapping retained and updated for notification delivery; guide covers each role. | Reconcile against the original full Part 1 submission before claiming every original requirement is complete. |
| Communication and professionalism | Concrete guide and screenshots available for an application-specific presentation. | Revised slides, rehearsed delivery and physical EXPO materials remain group tasks. |

## Verified locally on 5 November 2026

- Full frontend/backend build succeeds without warnings or errors.
- 25 API scenarios pass with remote storage simulation, including OpenAPI, SMTP recovery, private notification updates and read-only release verification.
- 30 browser workflow checks and 9 keyboard/error recovery checks pass.
- 161 automated accessibility/layout scans pass. Automated scans do not certify full accessibility.
- Root/frontend npm audits and transitive NuGet vulnerability checks report no findings.

The GitHub run and hosted release must also pass before the final revision is considered deployed. See Actions for the actual result rather than treating this local evidence as a cloud test result.

## Verified in production on 5 November 2026

- Release `e186a48` passed the database-aware health, React bundle and OpenAPI checks.
- All four roles authenticated. A fictional request completed submission, assignment, acceptance, completion, tenant closure and rating.
- Image upload, Linux image processing, private storage and authenticated photo download passed; anonymous photo access was rejected.
- The production worker delivered a real maintenance assignment email to the owner's Gmail inbox, with no exhausted SMTP deliveries.
- Verification recipients all used the owner's mailbox. Test accounts were disabled and the temporary property and tenancy archived.

GitHub failure-alert delivery and manual screen-reader/physical-device checks still need verification. Return Render to Free after the EXPO; the 11 November billing follow-up must execute successfully.

## Submission items outside source code

The combined Part 1/Part 2 report, authentic signed declaration, peer evaluations, truthful contribution evidence and individual ARC submissions remain required. The user guide in this repository supports that package. The EXPO is on 10 November; presentation delivery and attendance cannot be completed in source code.
