# PropCare API

The generated specification is served at `/api/openapi/v1.json`. It includes the current controller routes, validated input models, JWT bearer authentication and common error responses. API calls use the same HTTPS origin as the React application.

## Authentication

Send `POST /api/auth/login` with `{"email":"your-account@example.com","password":"your password"}`. A successful response contains `data.user` and `data.token`. Pass that token in `Authorization: Bearer <token>` for authenticated calls. The HTTP-only refresh cookie is rotated by `POST /api/auth/refresh`; browser refresh and logout calls also require `X-PropCare: 1`.

Tokens are checked against their active server session and current account role. Logging out, disabling an account or changing its role takes effect on subsequent requests. Public registration always creates a tenant, regardless of any submitted role.

## Main operations

| Operation | Access and purpose | Successful response |
| --- | --- | --- |
| `GET /api/health` | Public database-aware readiness and release identity | `status`, `database`, `version` |
| `GET /api/requests/page` | Authenticated, scoped search with `q`, `status`, `page`, `pageSize` | `data.items`, `total`, `page`, `pageSize` |
| `POST /api/requests` | Tenant with an active linked unit; title, detail, unitId, categoryId, urgency | HTTP 201 and `data` request summary |
| `GET /api/requests/{id}` | Tenant owner, responsible manager, assigned technician or administrator | `data.request`, allowed actions, comments, history, photos and rating |
| `POST /api/requests/{id}/assign` | Responsible manager; technicianId, urgency, optional note/scheduledAt | Updated request detail |
| `POST /api/requests/{id}/status` | Current role and state determine allowed action; action and optional note | Updated request detail and allowed next actions |
| `POST /api/requests/{id}/comments` | Authorised request participant; text | Confirmation message |
| `POST /api/requests/{id}/photos` | Authorised participant; filename, kind and base64 data | HTTP 201; private photo metadata is visible in request detail |
| `GET /api/requests/{id}/photos/{photoId}` | Authorised participant | JPEG bytes; never a public storage URL |
| `POST /api/requests/{id}/rate` | Reporting tenant after completion/closure; stars from 1 to 5 | Confirmation; one rating per request |
| `GET /api/notifications` | Current account only | Latest 100 in-app notifications |
| `POST /api/notifications/read` | Current account only | Marks the account's notifications read |
| `POST /api/notifications/email/retry` | Administrator, with SMTP enabled | Requeues exhausted email deliveries |
| `GET /api/settings` | Authenticated; email queue counts visible to administrator | Organisation, email configuration state and queue counts |

Administrative user, property, unit, category and technician writes require administrator access except the specifically permitted manager operations. Consult the generated specification for every route and input field.

## Errors and business rules

An error response is JSON such as `{"message":"Select one of your assigned units."}`. HTTP 400 indicates invalid input or a transition that is not allowed. HTTP 401 requires sign-in; 403 means the role cannot perform the action; 404 also protects inaccessible request identifiers. HTTP 409 indicates a duplicate or concurrent change. HTTP 413 rejects oversized photos and 429 indicates rate limiting.

The maintenance flow is submitted, review, assignment, technician acceptance, work, completion and tenant confirmation or manager approval. Hold/resume, rejection, cancellation and reopening have role/state restrictions. The server decides allowed transitions rather than trusting the UI. Status, history, comments and pending notifications commit together. Email delivery occurs after that commit so SMTP failure cannot undo a valid maintenance update.
