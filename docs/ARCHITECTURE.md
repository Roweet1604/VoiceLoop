# VoiceLoop Architecture

VoiceLoop is a two-part app: a React single-page client and an Express JSON API backed by MongoDB. They are separate npm projects in one repository and run as two processes in development.

## Folders

```
VoiceLoop/
├── client/                     React SPA (Vite, Tailwind CSS v4, React Router)
│   ├── index.html              HTML shell; loads the Inter font and src/main.jsx
│   ├── vite.config.js          Vite plugins: React and Tailwind
│   └── src/
│       ├── main.jsx            Mounts <App /> inside <BrowserRouter>
│       ├── App.jsx             Route table
│       ├── index.css           Tailwind import and design tokens (@theme)
│       ├── components/ui/      Small presentational primitives (Card, Button)
│       └── pages/              One component per route (HealthPage)
├── server/                     Express 5 API (ES modules)
│   ├── src/
│   │   ├── app.js              createApp(): middleware, routes, error handling (no listen)
│   │   ├── index.js            Startup: checks config, connects MongoDB, listens
│   │   ├── config/db.js        MongoDB connection via Mongoose
│   │   ├── models/             Mongoose models (User, Organization, Business, FeedbackLink, Feedback, AuditLog)
│   │   ├── routes/             One router per resource, mounted under /api
│   │   ├── services/           Business logic shared by routes (accountAccess)
│   │   ├── middleware/         notFound, errorHandler, validate, rateLimit, auth
│   │   ├── validators/         Plain validator functions used with validate()
│   │   └── utils/              AppError, session (JWT + cookie helpers)
│   ├── scripts/                Operator scripts (create-superadmin.js)
│   ├── tests/                  Vitest + Supertest; setup.js manages the test database
│   └── vitest.config.js
└── docs/                       Project documentation
```

## How the client and server communicate

- In development the client runs on the Vite dev server (`http://localhost:5173`) and the API runs on Express (`http://localhost:5000`).
- The client calls the API directly with `fetch` using `VITE_API_URL` as the base URL. There is no Vite proxy, so this is a cross-origin request.
- The server allows that origin through CORS, restricted to the single origin in `CLIENT_URL`, with credentials enabled. Requests from any other browser origin are refused by the browser.
- The session lives in an httpOnly cookie, so client requests to authenticated routes must use `fetch(url, { credentials: "include" })`.
- All API routes live under `/api` and exchange JSON. Request bodies are limited to 100 kB.

### Request pipeline (server)

Each request passes through, in order:

1. `helmet`: sets security headers.
2. `cors`: allows only `CLIENT_URL`, with credentials.
3. Rate limiter on `/api`: 300 requests per IP per 15 minutes, then `429`. It runs before body parsing so malformed or oversized requests are counted too.
4. `express.json({ limit: "100kb" })`: parses JSON bodies.
5. `cookie-parser`: makes the session cookie available as `req.cookies`.
6. Route handlers, e.g. `/api/health`, `/api/auth`.
7. `notFound`: any unmatched route becomes a `404`.
8. `errorHandler`: turns every error into the standard JSON shape and logs it.

## Authentication and access

### Sessions

- Login and register issue a JWT (HS256, signed with `JWT_SECRET`, valid 7 days) in a cookie named `vl_session`: `HttpOnly`, `SameSite` from `COOKIE_SAMESITE` (default `Lax`), `Secure` when `NODE_ENV=production`.
- The token holds only the user id. `requireAuth` loads the user and organization from the database on every request, so role and access changes apply immediately.
- Logout clears the cookie. A copied token stays valid until it expires; server-side revocation is not implemented yet.
- `SameSite=Lax` works while the client and API are on the same site (localhost in development, or e.g. `app.example.com` and `api.example.com`). Hosting them on unrelated domains would need `SameSite=None` plus CSRF protection.

### Access model

Access is stored on the organization: `accessStatus` (`pending`, `active`, `suspended`, `expired`, `rejected`), `accessStartsAt`, `accessExpiresAt` (null means no expiry), and `accessHistory` (action, from/to status, actor, reason, time).

- Public signup creates an `owner` user and a `pending` organization. The role is hard-coded; the request body cannot set it.
- `Organization.accessState()` computes the effective status at request time. An `active` organization past `accessExpiresAt` counts as `expired` without anything being written, so no scheduled job is needed.
- `requireAuth` accepts any logged-in user. `requireActiveAccess` (used after it) allows only active organizations and the Super Admin, and otherwise returns `403` with `ACCESS_PENDING`, `ACCESS_REJECTED`, `ACCESS_SUSPENDED`, `ACCESS_EXPIRED` or `NO_ORGANIZATION`.
- `GET /api/auth/me` uses only `requireAuth`, so pending and blocked users can still load their status page.

### Auth endpoints

| Method and path           | Auth           | Rate limit          | Result |
|---------------------------|----------------|---------------------|--------|
| `POST /api/auth/register` | none           | 5 per IP per hour   | `201` + session cookie; body `{ name, email, password, organizationName }` |
| `POST /api/auth/login`    | none           | 10 per IP per 15 min | `200` + session cookie, or `401 INVALID_CREDENTIALS` |
| `POST /api/auth/logout`   | none           | API default         | `204`, cookie cleared |
| `GET /api/auth/me`        | `requireAuth`  | API default         | `{ user, organization }` with the effective `accessStatus` |

Passwords are hashed with bcrypt (12 rounds), must be 10 or more characters, and may be at most 72 bytes (bcrypt's input limit). Login failures always return "Invalid email or password", whether the email exists or not.

### Super Admin provisioning

No API route creates a Super Admin. Create one from the server folder:

```
cd server
node scripts/create-superadmin.js --email admin@example.com --password "<strong password>" --name "Ops Admin"
```

The script uses `MONGODB_URI` from `server/.env` and refuses to modify an existing account. The password is visible in shell history, so clear that afterwards or run the command from a shell that doesn't record history.

### Super Admin API

All routes under `/api/super-admin` run `requireAuth` then `requireSuperAdmin`: logged-out callers get `401`, owners get `403 FORBIDDEN`.

| Method and path | Body | Allowed from (effective status) | Result |
|---|---|---|---|
| `GET /accounts` | query: `status` (`all` or a status), `q`, `expiring=true`, `page`, `limit` (max 100) | | `{ accounts, page, limit, total, totalPages, counts }` |
| `POST /accounts/:id/approve` | one of `{ days: 7 \| 30 \| 90 }`, `{ endDate }`, `{ noExpiry: true }` | pending, rejected | active, starts now |
| `POST /accounts/:id/reject` | `{ reason? }` | pending | rejected |
| `POST /accounts/:id/suspend` | `{ reason }` (required) | active | suspended |
| `POST /accounts/:id/reactivate` | optional term as for approve | suspended | active; keeps the old end date unless a term is given, and requires one if the old end date has passed |
| `POST /accounts/:id/extend` | `{ days: 1–3650 }` or `{ endDate }` | active (with an end date), expired | active; days are added to the current end date, or to today if it has passed; a new `endDate` must be later than the current one |

- `endDate` is an ISO 8601 timestamp, must be in the future and within 10 years. The admin UI sends the end of the chosen day in the admin's time zone.
- A change that doesn't fit the current status (e.g. approving an active account) returns `409 INVALID_TRANSITION` with an explanation. Unknown ids return `404`.
- List entries contain only `id`, `name`, `owner { id, name, email }`, `requestedAt`, `accessStatus` (effective), `accessStartsAt`, `accessExpiresAt` and `daysRemaining` (only for active accounts with an end date). `counts` gives totals per status plus `expiringSoon` (active, ending within 7 days).
- Search matches business name, owner name and owner email, case-insensitive; the input is escaped, so it's always a literal match.

### Audit trail

Every access change writes, in one MongoDB transaction:

- an `accessHistory` entry on the organization: `action`, `fromStatus`, `toStatus`, `accessExpiresAt`, `by` (admin user id), `reason`, `at`;
- an `AuditLog` document: `actor`, `actorEmail`, `action` (e.g. `access.approve`), `targetType`, `targetId`, `createdAt`, and a `context` with statuses, dates and the reason. No password data is ever written there.

Refused actions write nothing. Transactions need a replica set: MongoDB Atlas (including the free tier) has one, but a standalone local `mongod` doesn't, so access changes would fail there.

## Businesses

Each organization has at most one `Business` (unique index on `organizationId`): `name`, `locationName`, `welcomeMessage`, `googleReviewUrl`, `logoUrl` (not editable yet, always empty), `publicSlug`, `isActive`.

- **Public slug.** Generated once from the name: accents removed, lowercase, non-alphanumerics become hyphens, max 50 characters (`"Corner Café & Co."` → `corner-cafe-co`). If taken, a 5-character random suffix is added (`corner-cafe-co-k3x9q`). Names with no Latin letters or digits get `business` (plus a suffix if needed). The field is immutable, so renaming never breaks printed links or QR codes.
- **Stored as entered.** Text is not HTML-escaped in the database. The client renders it as plain text (React escapes it; nothing uses `dangerouslySetInnerHTML`).

### Owner API (`/api/business`)

All routes run `requireAuth`, `requireActiveAccess` and `requireOwner`. The Super Admin and owners whose access isn't active get `403`. The business is always found through the logged-in user's `organizationId` from the database. Ids in the URL, query or body are never used, and unknown body fields are ignored.

| Method | Body | Result |
|---|---|---|
| `GET /` | | `{ business }`, or `{ business: null }` if none yet |
| `POST /` | `name` (required, 2–80), `locationName` (≤80), `welcomeMessage` (≤300), `googleReviewUrl` (https URL or empty) | `201 { business }`; `409 BUSINESS_EXISTS` if the organization already has one |
| `PATCH /` | any of the same four fields (at least one) | `{ business }`; `404` if there's no business yet |

## Feedback links

A `FeedbackLink` is a named entry point (e.g. "Reception", "Table 4") with a permanent random 8-character `code`, reached at `/f/<business slug>/<code>`.

- **Default link.** Every business has one "Main link" (`isDefault: true`), which also serves `/f/<slug>` with no code. It's created with the business. `ensureDefaultLink()` creates it if missing and is safe to run repeatedly or concurrently; a partial unique index allows one default per business. Older businesses get it the first time the owner calls `GET /api/links`, or all at once with `node scripts/ensure-default-links.js`.
- **Deactivating** a link refuses new submissions through it (generic 404) but never deletes or changes its feedback.

### Owner API (`/api/links`)

Same guards as `/api/business` (`requireAuth`, `requireActiveAccess`, `requireOwner`). The business comes from the logged-in user's organization; link lookups are scoped to that business, so another tenant's link id is a `404`. If the owner has no business yet, the response is `404 NO_BUSINESS`.

| Method | Body | Result |
|---|---|---|
| `GET /` | | `{ links: [{ id, name, code, isActive, isDefault, feedbackCount, … }], unlinkedFeedbackCount }`, default link first |
| `POST /` | `name` (2–60) | `201 { link }` with a generated code; at most 200 links per business (`409 LINK_LIMIT`) |
| `PATCH /:id` | `name` and/or `isActive` (boolean) | `{ link }` |

## Feedback

`Feedback` stores one submission: `businessId`, `organizationId`, `linkId`, `category` (`general`, `complaint`, `suggestion`, `compliment`, `other`), `message` (1–2000), optional `customerName` (≤80) and `customerEmail`, `submissionType` (`text`), `reviewStatus` (`new`/`reviewed`), `complaintStatus` (`open` for complaints, otherwise null; later `in_progress`/`resolved`), `internalNotes`, `submittedAt` and `idempotencyKey`. Indexes: `{ businessId, submittedAt }`, unique `{ businessId, idempotencyKey }`, `{ linkId }`.

## Public API (`/api/public`)

No session needed. Every route is limited to 60 requests per IP per minute, on top of the API-wide limit. Responses are sent with `Cache-Control: no-store`.

A business is publicly available only when it's active and its organization's access is currently active (not pending, rejected, suspended or past its end date). Unknown slugs, unknown or malformed link codes, inactive links, another business's link code, and unavailable businesses all return the same `404 "This feedback page isn't available"`.

| Method and path | Result |
|---|---|
| `GET /business/:slug` | `{ business }` |
| `GET /f/:slug` and `GET /f/:slug/:code` | `{ business, linkCode }`. The link's name is not exposed. |
| `POST /f/:slug/submit` | `201 { submitted: true, submittedAt }` |

`business` is always just `{ slug, name, locationName, welcomeMessage, logoUrl, googleReviewUrl }`.

**Submitting feedback.** The body takes `category`, `message`, optional `customerName`, `customerEmail` and `linkCode`, plus a required `idempotencyKey` (16–100 characters of `A–Z a–z 0–9 _ -`, e.g. `crypto.randomUUID()`). Other fields are ignored. Status fields and notes always start at their defaults.

- **No link code:** the feedback is attributed to the default link.
- **Idempotency:** a repeated key for the same business stores nothing new and returns the original `201` response, including when two copies arrive at once. The client should generate one key per submission attempt and reuse it on retries.
- **Rate limit:** at most 10 submissions per IP per 10 minutes.
- **Confirmation:** success is only returned after the database write succeeds.

## Client routes

| Path | Guard | Page |
|---|---|---|
| `/signup`, `/login` | logged-out only | Auth forms |
| `/waiting-for-approval` | logged in | Status for pending, rejected, suspended or expired owners |
| `/app/setup` | active owner without a business | Create the business |
| `/app/dashboard`, `/app/links`, `/app/settings` | active owner with a business | Sidebar layout (`AppShell`); links page has QR codes |
| `/f/:slug`, `/f/:slug/:code` | none (public, outside the session gate) | Customer feedback form |
| `/super-admin` | Super Admin | Account approvals |
| `/health` | none | API reachability check |

`BusinessGate` (in `context/BusinessContext.jsx`) loads the business for every `/app` page, sends owners without one to `/app/setup`, and re-checks the session on a `401`/`403` so revoked access lands on the waiting page.

### Response shapes

Success responses are route-specific JSON, e.g. `GET /api/health` returns `{ "status": "ok" }`.

Every error uses one shape:

```json
{ "error": { "message": "Route not found: GET /api/nope", "code": "NOT_FOUND" } }
```

Validation failures add a `details` object keyed by field. Error codes currently in use: `BAD_REQUEST`, `UNAUTHORIZED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `ACCESS_PENDING`, `ACCESS_REJECTED`, `ACCESS_SUSPENDED`, `ACCESS_EXPIRED`, `NO_ORGANIZATION`, `NOT_FOUND`, `EMAIL_IN_USE`, `INVALID_TRANSITION`, `PAYLOAD_TOO_LARGE`, `INVALID_JSON`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Stack traces are never sent to the client. They are logged on the server. When `NODE_ENV=production`, unexpected (500) errors also replace their message with `"Internal server error"`.

### Error and validation conventions (server)

- Throw `AppError.badRequest()`, `.unauthorized()`, `.forbidden()`, `.notFound()` or `.conflict()` for expected failures. Express 5 forwards errors thrown in async handlers to `errorHandler` automatically.
- Validate input with `validate({ body, query, params })` from `middleware/validate.js`. Each validator is a plain function that returns `{ field: "problem" }`; see the comment in that file for an example.

## Environment variables

### Server (`server/.env`, template in `server/.env.example`)

| Variable      | Required | Default                 | Purpose |
|---------------|----------|-------------------------|---------|
| `NODE_ENV`    | No       | unset (development)     | Set to `production` to hide internal error messages. |
| `PORT`        | No       | `5000`                  | Port the API listens on. |
| `MONGODB_URI` | Yes, for the database | unset          | MongoDB connection string. If unset, the server starts without a database and logs a warning. |
| `CLIENT_URL`  | No       | `http://localhost:5173` | The only browser origin allowed by CORS. |
| `JWT_SECRET`  | Yes      | none                    | Signs session tokens. At least 32 random characters; the server refuses to start otherwise. |
| `COOKIE_SAMESITE` | No   | `lax`                   | `SameSite` attribute of the session cookie. |
| `MONGODB_TEST_URI` | No  | unset                   | Database for `npm test`; its name must end in `_test`. If unset, tests use the `MONGODB_URI` cluster with database `voiceloop_test`. |

`dotenv` loads `.env` from the current working directory, so start the server from inside `server/` (as `npm run dev` does).

### Client (`client/.env`, template in `client/.env.example`)

| Variable       | Required | Default                 | Purpose |
|----------------|----------|-------------------------|---------|
| `VITE_API_URL` | No       | `http://localhost:5000` | Base URL of the API. Vite inlines it at build time, so changing it requires a rebuild. |

Only variables prefixed with `VITE_` reach the browser bundle. Never put secrets in the client env.

## Running locally

```
cd server && npm run dev     # API on http://localhost:5000
cd client && npm run dev     # UI on http://localhost:5173
cd server && npm test        # Vitest + Supertest against the test database
```

Tests clear every collection in the test database before each test. `tests/setup.js` refuses to run against a database whose name does not end in `_test`.
