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
│   │   ├── services/           Business logic shared by routes (accountAccess, accountDeletion,
│   │   │                       audioFile, storage/, transcription/)
│   │   ├── middleware/         notFound, errorHandler, validate, rateLimit, auth
│   │   ├── validators/         Plain validator functions used with validate()
│   │   └── utils/              AppError, session (JWT + cookie helpers)
│   ├── private-storage/        Local audio files (gitignored, never served statically)
│   ├── scripts/                Operator scripts (create-superadmin.js)
│   ├── tests/                  Vitest + Supertest; setup.js manages the test database
│   └── vitest.config.js
└── docs/                       Project documentation
```

## How the client and server communicate

- In development the client runs on the Vite dev server (`http://localhost:5173`) and the API runs on Express (`http://localhost:5000`).
- The client calls relative `/api/...` paths. The Vite dev server proxies `/api` to `API_PROXY_TARGET` (default `http://localhost:5000`), so in development the browser sees one origin and the session cookie is first-party.
- If a deployed client must call an API on another origin, set `VITE_API_URL` at build time. The server allows exactly one browser origin through CORS (`CLIENT_URL`), with credentials enabled.
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
| `POST /api/auth/forgot-password` | none    | 5 per IP per hour; 3 links per account per hour | Always `200 { message }` with the same text; body `{ email }` |
| `POST /api/auth/reset-password`  | none    | 10 per IP per 15 min | `200 { message }`, cookie cleared, or `400 INVALID_RESET_TOKEN`; body `{ token, newPassword }` |

Passwords are hashed with bcrypt (12 rounds), must be 10 or more characters, and may be at most 72 bytes (bcrypt's input limit). Login failures always return "Invalid email or password", whether the email exists or not.

### Password reset

`services/passwordReset.js`, for owners and the Super Admin alike.

- **Request.** `forgot-password` answers before doing any lookup, so neither the response nor its timing shows whether an account exists. Afterwards, for a known email: if the account has had fewer than 3 links in the last hour, older unused links are retired, a new one is created, and `CLIENT_URL/reset-password?token=…` is emailed. Past that limit, nothing is sent (logged as a warning); the caller sees the same answer. Failures are logged without the token.
- **Token.** 32 random bytes, base64url (43 characters), valid for 30 minutes and once. `PasswordResetToken` stores only its SHA-256 hash, with `userId`, `expiresAt`, `usedAt` and `createdAt`; a TTL index removes records a day after they expire.
- **Reset.** The new password follows the signup rules. Claiming the token (unused and unexpired) and setting the new hash and `passwordChangedAt` happen in one transaction, so a link can't be used twice even concurrently; other unused links for the account are retired too. Every bad token (malformed, unknown, used, expired, operator objects) gets the same `400 INVALID_RESET_TOKEN`.
- **Sessions.** Session tokens carry `iatMs` (issue time in milliseconds). `requireAuth` refuses any session issued before `User.passwordChangedAt` with `401 SESSION_EXPIRED`, so a reset logs out every device.
- **Deletion.** Reset tokens belong to users, so account deletion removes them through `USER_DATA` (by `userId`) before deleting the users.

### Email

`services/email` exposes `sendEmail({ to, subject, text, html, idempotencyKey? })`. `EMAIL_PROVIDER` chooses:

- `console` (default): prints the message, link included, to the server log. Development only: with `NODE_ENV=production` it refuses to send, logs an error and prints nothing from the message.
- `resend`: `POST https://api.resend.com/emails` with `Authorization: Bearer RESEND_API_KEY`, sender `EMAIL_FROM`, and an `Idempotency-Key`. A missing key or sender refuses to send and logs why. Resend's error name and message are reported; the key is never logged.

The server logs the email setup at startup, as an error when it can't deliver (for example `console` in production). **Status:** `console` is implemented and tested. `resend` is implemented and tested against a mocked API only, and is awaiting credentials. Resend's test sender `onboarding@resend.dev` only delivers to the account owner's own address; other recipients need a verified domain. Free plan at the time of writing: 3,000 emails a month, 100 a day (verify on resend.com/pricing).

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
| `GET /accounts/:id/history` | | any | `{ account { id, name }, accessHistory, auditEntries }`, newest first; `404` for unknown, malformed or deleted ids |
| `GET /audit-logs` | query: `page`, `limit` (≤100, default 50), `action`, `targetId`, `from`, `to` (ISO), `q` (≤100) | | `{ entries, page, limit, total, totalPages, actions }`, newest first; `actions` lists every recorded action for the filter |
| `GET /overview` | | | `{ accounts { pending, active, suspended, rejected, expired, expiringSoon }, businesses, feedback, voiceRecordings, audioBytes }` |

- `endDate` is an ISO 8601 timestamp, must be in the future and within 10 years. The admin UI sends the end of the chosen day in the admin's time zone.
- A change that doesn't fit the current status (e.g. approving an active account) returns `409 INVALID_TRANSITION` with an explanation. Unknown ids return `404`.
- List entries contain only `id`, `name`, `owner { id, name, email }`, `requestedAt`, `accessStatus` (effective), `accessStartsAt`, `accessExpiresAt` and `daysRemaining` (only for active accounts with an end date). `counts` gives totals per status plus `expiringSoon` (active, ending within 7 days).
- Search matches business name, owner name and owner email, case-insensitive; the input is escaped, so it's always a literal match.

### Audit trail

Every access change writes, in one MongoDB transaction:

- an `accessHistory` entry on the organization: `action`, `fromStatus`, `toStatus`, `accessExpiresAt`, `by` (admin user id), `reason`, `at`;
- an `AuditLog` document: `actor`, `actorEmail`, `action` (e.g. `access.approve`), `targetType`, `targetId`, `createdAt`, and a `context` with statuses, dates and the reason. No password data is ever written there.

Owners' business changes are recorded too, in the same transaction as the change: `business.created` (context `businessName`) and `business.updated` (context `businessName` and `fields`, the names of the settings that actually changed, never their values; saving identical values records nothing). Deleting one feedback item records `feedback.deleted` with context `category` and `submissionType` only (no text, name or email). These target the owner's Organization, not the Business, so account deletion removes them with the rest of the organization's trail, and they store no `actorEmail`.

**Reading the trail** (`services/auditLog.js`). Responses never pass stored entries through: each is `{ id, action, createdAt, actor { id, name, role }, target { type, id, name, exists }, context }`, where the actor's name is looked up (never an email, and `actorEmail` is never returned) and `context` keeps only keys on `SAFE_CONTEXT_KEYS`. The audit-log search `q` matches `action`, `context.organizationName`, `context.businessName` and `context.reason`, escaped so it's always literal. Signups are recorded only in `accessHistory` (`requested`), not as audit entries.

`overview` counts accounts with the same effective-status rules as the account list. `audioBytes` is the sum of `audioSizeBytes` recorded at upload for voice feedback that still exists.

Refused actions write nothing. Transactions need a replica set: MongoDB Atlas (including the free tier) has one, but a standalone local `mongod` doesn't, so access changes would fail there.

### Permanent account deletion

`POST /api/super-admin/accounts/:id/delete` with `{ confirmName }` (Super Admin only). `confirmName` must match the business name exactly (case-sensitive, surrounding spaces ignored), or the organization name if no business exists. Otherwise the response is `400 CONFIRMATION_MISMATCH` and nothing is deleted. Unknown ids return `404`. An organization that contains a Super Admin returns `403`.

`deleteOrganizationAccount()` in `services/accountDeletion.js` runs in one transaction. If any step fails, nothing is deleted. It removes:

- feedback (including internal notes), feedback links, the business, and the organization's users (never Super Admins), via `ORGANIZATION_DATA`;
- all earlier AuditLog entries about the organization;
- the organization itself, including its `accessHistory`.

It then writes one AuditLog entry: `action: "account_deleted"`, `actor`, `targetId` (the organization id), `context.businessName` and `createdAt`, with no email, feedback text or password data. The deleted owner's session stops working immediately, because `requireAuth` no longer finds the user, and the public pages return the generic 404.

**Stored files.** Inside the transaction the service collects the storage keys of every file type listed in `STORED_FILES` (currently voice recordings, from `Feedback.audioKey`). After the commit it deletes those files from storage. A file that can't be removed is logged with its key for manual cleanup; it never undoes or fails the deletion. The response includes `files: { removed, failed }` (counts only, no keys).

**Deletion rule.** Any new collection holding organization data must be added to `ORGANIZATION_DATA`, and any new stored file type to `STORED_FILES`. The test "covers every model" in `tests/deletion.test.js` fails for any model with an `organizationId` that isn't listed, and checks that no stored file remains under the deleted business's key prefix.

### Automatic deletion (retention)

`services/retention.js` deletes every Feedback document whose `submittedAt` is older than `RETENTION_DAYS` (default 45), whatever its review or complaint status, notes or history, with its recording. No other collection is touched.

- **When:** once in the background at startup (after the server starts listening; it never delays or blocks startup), then every hour (`setInterval`, unref'd). A run that starts while another is still going in the same process is skipped. Errors are logged (`[retention] run failed: …`), never thrown.
- **How:** batches of 200, oldest id first. For each batch the records are deleted (the filter repeats the cutoff, so nothing newer can match), then their audio files, through the same `deleteStoredFiles()` as account deletion: a file that can't be removed is logged with its key only, and the run continues.
- **Audit:** a run that deleted something writes one AuditLog entry: `action: "retention.cleanup"`, `targetType: "Platform"`, no `actor` and no `targetId`, and `context { feedbackDeleted, audioFilesDeleted, cutoff }`. It holds no ids, customer text or emails and points at no organization, so account deletion has nothing to remove from it. The Super Admin audit log shows it as "System" / "All accounts". Runs that delete nothing write no entry.
- **By hand:** `node scripts/run-retention.js --dry-run` prints how many items and audio files would be deleted and deletes nothing; without the flag it runs once, like the server does.
- **Owners see it:** `retentionDays` is returned by `GET /api/feedback`, `GET /api/feedback/summary`, `GET /api/feedback/:id` and `GET /api/analytics`. The detail page shows "Deletes automatically in N days"; the inbox and analytics pages show a notice suggesting a CSV export.
- The Privacy Policy and Terms state 45 days. If `RETENTION_DAYS` is changed in production, update those pages too.

## Businesses

Each organization has at most one `Business` (unique index on `organizationId`): `name`, `locationName`, `welcomeMessage`, `googleReviewUrl`, `logoUrl` (not editable yet, always empty), `publicSlug`, `isActive`, and the landing-card text `reviewCardText` and `feedbackCardText` (≤160 each; empty = default).

- **Landing screen.** When `googleReviewUrl` is an https link, `/f/...` first shows two equal-weight cards, always both, to every customer. The **Google Review** card opens the link in a new tab. The **Complaint/Personal Feedback** card opens the form, which has a Back button. Without a review link, the form shows directly. The review button ("Yes! Why not") also stays below the form and on the success screen.
- **Wording.** Card titles and buttons are fixed in `client/src/lib/landingWording.js`: "Google Review" / "Yes! Why not" and "Complaint/Personal Feedback" / "Suggest". Owners can only change the two card texts (Settings → Customer page wording). The defaults are "Liked the service, Wanna compliment" and "Yes i have complaint or suggestion".
- **Product decision on record (Phase 3D-2).** This fixed wording was chosen by the product owner. It ties the Google card to compliments and the private card to complaints, which conflicts with CLAUDE.md §9 ("Never filter customers based on sentiment"). It's also close to the "review gating" Google's review policies prohibit, which can lead to removed reviews or a restricted listing for the business. Revisit before onboarding real businesses, and update §9 if the rule is meant to change.
- **Removed fields.** `reviewCardTitle`, `reviewCardButton`, `feedbackCardTitle` and `feedbackCardButton` existed briefly in Phase 3D. They're no longer in the schema, accepted or returned. `node scripts/unset-removed-wording-fields.js` removes any stored values (only those four fields; safe to repeat).

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

`Feedback` stores one submission: `businessId`, `organizationId`, `linkId`, `category` (`general`, `complaint`, `suggestion`, `compliment`, `other`), `message` (1–2000 for text, empty for voice), optional `customerName` (≤80) and `customerEmail`, `submissionType` (`text` or `voice`), for voice only `audioKey`, `audioMimeType`, `audioSizeBytes`, `audioDurationSec` and `transcriptStatus` (`unavailable`, `processing`, `completed`, `failed`) with `transcriptText`, `reviewStatus` (`new`/`reviewed`), `complaintStatus` (`open` for complaints, otherwise null; later `in_progress`/`resolved`), `internalNotes`, `submittedAt` and `idempotencyKey`. Indexes: `{ businessId, submittedAt }`, unique `{ businessId, idempotencyKey }`, `{ linkId }`.

### Owner inbox (`/api/feedback`)

Same guards as `/api/business`. Every query is scoped to the business of the logged-in user's organization, so another tenant's feedback id is a `404`, and ids or filters pointing at another tenant match nothing. Responses contain no organization or business ids.

| Method and path | Input | Result |
|---|---|---|
| `GET /` | `page`, `limit` (≤50), `q`, `category`, `reviewStatus`, `complaintStatus`, `submissionType`, `transcriptStatus`, `linkId`, `from`, `to` (ISO dates) | `{ feedback: [{ id, category, excerpt, customerName, submissionType, audioDurationSec, transcriptStatus, reviewStatus, complaintStatus, submittedAt, link }], page, limit, total, totalPages }`, newest first |
| `GET /summary` | `tz` (IANA zone, default UTC) | `total`, `new`, `openComplaints`, `inProgress`, `resolved`, `volume` (last 30 local days), `byCategory`, `byLink`, `unlinkedCount` |
| `GET /:id` | | Full feedback, with `internalNotes` and `statusHistory` (author names resolved); for voice, `audio: { mimeType, sizeBytes, durationSec }` (never the storage key), `transcriptStatus`, and `transcriptText` (only when completed) |
| `GET /:id/audio` | | The recording, streamed with its content type and `Cache-Control: private, no-store`. `404` for text feedback, another tenant's id or a missing file |
| `PATCH /:id/review` | `reviewStatus`: `new` or `reviewed` | Setting the current value again changes nothing |
| `PATCH /:id/complaint-status` | `status`: `open`, `in_progress`, `resolved` or `reopen`; `resolutionSummary` (required for `resolved`, ≤1000) | Complaints only (`409 NOT_A_COMPLAINT`). Allowed: open→in progress/resolved, in progress→open/resolved, resolved→reopen (open). Anything else is `409 INVALID_TRANSITION` |
| `POST /:id/notes` | `text` (1–1000) | `201`, with the note's author and time |
| `DELETE /:id` | | `204`. Permanently deletes the item (notes and history included) and an audit entry `feedback.deleted` in one transaction, then its recording through `deleteStoredFiles()`; a file that can't be removed is logged, never returned as an error. Another tenant's id is `404` |

- **Search** matches message and transcript text case-insensitively, and the input is escaped, so `$5.00 (` matches literally. It's a scan within one business; fine at this scale, but a text index would be needed for very large inboxes.
- **History:** review and complaint changes are recorded in `statusHistory` (`field`, `from`, `to`, `by`, `at`, and `resolutionSummary` when resolving).
- **Concurrent edits:** updates only apply if the status is still what was read; otherwise the response is `409 CONFLICT`.
- **Viewing changes nothing.** Opening a feedback item never marks it reviewed or changes its status.
- **Never public:** notes, history and statuses are embedded in the feedback document and never returned by any `/api/public` route.

### CSV export (`GET /api/feedback/export.csv`)

Same guards, the same filters as `GET /` (validated by the same function, built by `services/feedbackFilter.js`), and its own limit of 30 exports per IP per 15 minutes. It's mounted before the inbox router so `export.csv` is never read as an id.

- **Columns:** `Submitted at (UTC)` (ISO), `Category`, `Type`, `Message`, `Customer name`, `Customer email`, `Source` (link name), `Review status`, `Complaint status`, `Resolution summary`. No ids, internal notes, history, audio keys or transcripts.
- **Format:** UTF-8 with a byte order mark (so Excel reads it correctly), CRLF line endings, fields quoted when they contain a comma, quote or line break (quotes doubled). Newest first.
- **Formula injection:** a cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'` (`utils/csv.js`), so spreadsheets show it as text instead of running it.
- **Cap:** at most 10,000 rows (`createApp({ limits: { exportRows } })` overrides it in tests). Headers `X-Export-Total`, `X-Export-Rows`, `X-Export-Truncated` and `X-Export-Row-Limit` say whether the file was cut off; CORS exposes them and `Content-Disposition`.
- **Headers:** `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="voiceloop-feedback-<slug>-<date>.csv"`, `Cache-Control: private, no-store`. Rows are streamed from a database cursor; if that fails part-way, the connection is cut so a partial file can't pass for a complete one.

## Analytics (`GET /api/analytics`)

Same owner guards; always the owner's own business. Query: `from` and `to` as local calendar days (`YYYY-MM-DD`, both included, at most 366 days), and `tz` (IANA zone, default `UTC`). Defaults: the 30 days ending today in `tz`. Invalid dates, reversed or too-long ranges, unknown zones and repeated keys are `400` with `details`.

Everything is counted from stored records:

- `range` (`from`, `to`, `timeZone`, `days`) and `total` (feedback submitted in the range).
- `volume`: one `{ date, count }` per day of the range, zeros included, grouped by local day in `tz`.
- `byCategory` (every category), `byLink` (every link of the business, including zero counts and inactive links), `unlinkedCount`, `bySubmissionType` (`text`, `voice`).
- `complaints`: `received` in the range with their current `open` / `inProgress` / `resolved` counts; `resolvedInRange`, complaints whose latest resolution (from `statusHistory`) falls in the range, whenever they were received; and `averageHoursToResolve` over those, from submission to that latest resolution (`null` if none). A complaint that was resolved and later reopened isn't counted as resolved.
- `keywords` (`method: "keyword counts"`): words and two-word phrases in complaints received in the range (`services/keywords.js`). Text is lowercased, apostrophes and punctuation removed, a built-in English stopword list, single characters and bare numbers dropped; a stopword breaks a phrase. Each complaint counts a term at most once. The top 10 terms found in at least 3 complaints, phrases before single words at equal counts. Deterministic counting, not AI.

## Public API (`/api/public`)

No session needed. Every route is limited to 60 requests per IP per minute, on top of the API-wide limit. Responses are sent with `Cache-Control: no-store`.

A business is publicly available only when it's active and its organization's access is currently active (not pending, rejected, suspended or past its end date). Unknown slugs, unknown or malformed link codes, inactive links, another business's link code, and unavailable businesses all return the same `404 "This feedback page isn't available"`.

| Method and path | Result |
|---|---|
| `GET /business/:slug` | `{ business }` |
| `GET /f/:slug` and `GET /f/:slug/:code` | `{ business, linkCode }`. The link's name is not exposed. |
| `POST /f/:slug/submit` | `201 { submitted: true, submittedAt }` |
| `POST /f/:slug/submit-voice` | `201 { submitted: true, submittedAt }` (multipart) |

`business` is always just `{ slug, name, locationName, welcomeMessage, logoUrl, googleReviewUrl, reviewCardText, feedbackCardText }`.

**Submitting feedback.** The body takes `category`, `message`, optional `customerName`, `customerEmail` and `linkCode`, plus a required `idempotencyKey` (16–100 characters of `A–Z a–z 0–9 _ -`, e.g. `crypto.randomUUID()`). Other fields are ignored. Status fields and notes always start at their defaults.

- **No link code:** the feedback is attributed to the default link.
- **Idempotency:** a repeated key for the same business stores nothing new and returns the original `201` response, including when two copies arrive at once. The client should generate one key per submission attempt and reuse it on retries.
- **Rate limit:** at most 10 submissions per IP per 10 minutes.
- **Confirmation:** success is only returned after the database write succeeds.

**Submitting voice feedback.** `multipart/form-data` with the same `category`, optional `customerName`, `customerEmail`, `linkCode`, a required `idempotencyKey`, `durationSec` (the length the browser measured, `0 < d ≤ 120`), and one file in the `audio` field.

- **Accepted files:** at most 5 MB (`413` above), types `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav` (parameters such as `;codecs=opus` are ignored). The file's first bytes must match the declared type (EBML with doctype `webm`, `OggS`, `ftyp`, ID3 or an MPEG frame, `RIFF…WAVE`), and the size must be plausible for the claimed duration. Anything else is `400` with `details.audio` or `details.durationSec`, and nothing is stored.
- **Order:** the business is checked before the upload is read; then the fields and file are validated, the link resolved, and the idempotency key checked. Only then is the file written to storage, followed by the database record. If the record can't be saved, the file is deleted again.
- **Idempotency:** a repeated key stores no second record or file. When two copies race, the losing copy's file is deleted.
- **Rate limit:** at most 5 voice submissions per IP per 10 minutes, counted separately from text.
- **Transcription:** `transcriptStatus` is `unavailable` while no speech-to-text provider is configured, and no transcript is ever created.
- **Nothing private comes back:** the response never contains ids, storage keys or paths.

### Audio storage and transcription

`services/storage` is the only code that touches stored files. Drivers implement `put(key, buffer)`, `getStream(key)` and `delete(key)`, chosen by `STORAGE_DRIVER`:

- `local` (default): files under `server/private-storage/` (or `STORAGE_LOCAL_DIR`). That folder is gitignored and no route serves it; audio is only read through `GET /api/feedback/:id/audio` after the ownership check. Suitable for development, or a single server with a persistent disk.
- `s3`: a stub. It refuses to start unless `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are set, and even then rejects every operation. **Not implemented.**

Keys are `<businessId>/<32 random hex characters>.<ext>`, validated against a strict pattern before any file system access, and never sent to a client.

`services/transcription` selects a provider with `TRANSCRIPTION_PROVIDER`. Only `none` exists: it reports itself unavailable and never calls an external service. **No speech-to-text is integrated.**

The owner's detail page fetches the recording with the session cookie and plays it from a local object URL, so playback works when the API is on another origin and no public audio address exists.

## Client routes

| Path | Guard | Page |
|---|---|---|
| `/` | logged-out (logged-in users go to their home); outside the session gate, so it shows even if the API is down | Landing page |
| `/privacy`, `/terms` | none (public, outside the session gate) | Draft Privacy Policy and Terms; placeholders in `[BRACKETS]` must be filled in before launch |
| `/signup`, `/login` | logged-out only | Auth forms |
| `/forgot-password`, `/reset-password` | none (inside the session gate) | Request a reset link; choose a new password from it |
| `/waiting-for-approval` | logged in | Status for pending, rejected, suspended or expired owners |
| `/app/setup` | active owner without a business | Create the business |
| `/app/dashboard`, `/app/feedback`, `/app/feedback/:feedbackId`, `/app/analytics`, `/app/links`, `/app/settings` | active owner with a business | Sidebar layout (`AppShell`) |
| `/f/:slug`, `/f/:slug/:code` | none (public, outside the session gate) | Customer feedback form |
| `/super-admin` | Super Admin | Platform overview and the accounts table, with a History panel per account |
| `/super-admin/audit-logs` | Super Admin | Filterable audit log |
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
| `STORAGE_DRIVER` | No    | `local`                 | Audio storage driver: `local` or `s3` (stub, not implemented). Unknown or unconfigured values stop the server at startup. |
| `STORAGE_LOCAL_DIR` | No | `server/private-storage` | Folder for the local driver. Keep it outside any public path. Tests use a temporary folder. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Only for `s3` | unset | Checked by the S3 stub; not used yet. |
| `TRANSCRIPTION_PROVIDER` | No | `none`                 | Speech-to-text provider. Only `none` exists. |
| `RETENTION_DAYS` | No | `45`                   | Feedback older than this is deleted automatically, with its recording. Whole number from 1 to 3650; anything else stops the server at startup. |
| `EMAIL_PROVIDER` | No      | `console`               | `console` (development: prints emails to the log) or `resend`. |
| `RESEND_API_KEY` | For `resend` | unset             | Resend API key. Secret: server only. |
| `EMAIL_FROM`     | For `resend` | unset             | Sender, e.g. `VoiceLoop <no-reply@yourdomain.com>`, on a domain verified in Resend. |

`dotenv` loads `.env` from the current working directory, so start the server from inside `server/` (as `npm run dev` does).

### Client (`client/.env`, template in `client/.env.example`)

| Variable       | Required | Default                 | Purpose |
|----------------|----------|-------------------------|---------|
| `VITE_API_URL` | No       | empty (same origin)     | Base URL of the API, only when it is on another origin. Vite inlines it at build time, so changing it requires a rebuild. |
| `API_PROXY_TARGET` | No   | `http://localhost:5000` | Dev server only: where Vite forwards `/api`. Never reaches the browser. |

Only variables prefixed with `VITE_` reach the browser bundle. Never put secrets in the client env.

## Running locally

```
cd server && npm run dev     # API on http://localhost:5000
cd client && npm run dev     # UI on http://localhost:5173
cd server && npm test        # Vitest + Supertest against the test database
```

Tests clear every collection in the test database before each test. `tests/setup.js` refuses to run against a database whose name does not end in `_test`.
