# VoiceLoop Threat Model

Written for Phase 6A (October 2026) after reading the server and client code. For each threat it lists what protects against it **today**, with file references, and what is **not covered**. "Not covered" items are real gaps, not hypothetical ones; the most important are collected in [Open gaps, by priority](#open-gaps-by-priority) at the end.

Paths are relative to the repository root. Tests named here are in `server/tests/`.

## Assets and actors

| Asset | Where it lives |
|---|---|
| Customer feedback text, optional name and email | `Feedback` collection (MongoDB Atlas) |
| Voice recordings | Private object storage: `server/private-storage/` (local driver). Only the key is in MongoDB |
| Internal notes, complaint history | Embedded in `Feedback` |
| Owner accounts (email, bcrypt hash) | `User` collection |
| Access status and history | `Organization` collection |
| Audit trail | `AuditLog` collection |
| Password reset tokens | `PasswordResetToken` (SHA-256 hash only) |
| Secrets: `JWT_SECRET`, `MONGODB_URI`, `RESEND_API_KEY`, `S3_*` | `server/.env` (gitignored) / host environment |

Actors: anonymous customers (public pages), business owners (one organization each), the Super Admin (no organization), and outsiders.

## 1. Tenant data leakage

**Threat.** An owner reads or changes another organization's feedback, links, recordings or analytics, by guessing ids or passing another tenant's ids in the request.

**Protected today**

- The tenant is never taken from the request. `ownBusiness()` (`server/src/services/ownBusiness.js`, and the copies in `routes/business.js` and `routes/links.js`) finds the business from `req.user.organizationId`, and `req.user` is loaded from the database by `requireAuth` (`server/src/middleware/auth.js`).
- Every owner query includes `businessId: business._id`: `ownFeedback()` and every update in `server/src/routes/inbox.js` (including `DELETE /:id`), `ownLink()` in `routes/links.js`, `feedbackFilter()` (`services/feedbackFilter.js`, used by the inbox and CSV export), and the `$match` in `routes/analytics.js`. Another tenant's id is therefore `404`, the same as an unknown one.
- Updates repeat the business scope in their filter (`conditionalUpdate()` in `routes/inbox.js`), so even a bug in the read can't redirect a write.
- Responses carry no organization or business ids (`serializeDetail()`, list mapping in `routes/inbox.js`; `publicBusiness()` in `routes/public.js`).
- Tests: `inbox.test.js`, `voice.test.js`, `export.test.js`, `analytics.test.js`, `business.test.js`, `feedbackDeletion.test.js` ("returns 404 to another tenant and leaves the item untouched").

**Not covered**

- Scoping is enforced by convention in each route, not by a database-level mechanism (no Mongoose plugin that forces a tenant filter). A new route that forgets `businessId` would leak. Mitigation: tests per route; review every new query.
- Only one user per organization exists today (no team members), so there is no intra-organization permission model yet.

## 2. Account takeover

**Threat.** An attacker gets into an owner's or the Super Admin's account by guessing passwords, abusing password reset, or stealing a session.

**Protected today**

- Passwords: bcrypt with cost 12 (`routes/auth.js`, `services/passwordReset.js`), minimum 10 characters, more than 72 bytes refused instead of silently truncated (`validators/auth.js`). `passwordHash` is `select: false` and stripped by `toJSON` (`models/User.js`); no route returns it.
- Login: same `401 INVALID_CREDENTIALS` for unknown email and wrong password, and a dummy bcrypt compare for unknown emails so timing matches (`DUMMY_HASH` in `routes/auth.js`). Rate limit 10 per IP per 15 minutes (`app.js`).
- Password reset (`services/passwordReset.js`): 32 random bytes, only the SHA-256 hash stored, valid 30 minutes, single use (claimed in a transaction), only the newest link works, at most 3 links per account per hour plus 5 requests per IP per hour. The forgot-password response is identical and sent before any lookup, so it reveals nothing. A reset sets `passwordChangedAt`, and `requireAuth` refuses every session issued before it (all devices logged out). Tests: `passwordReset.test.js`.
- The console email provider (which prints reset links) refuses to run when `NODE_ENV=production` (`services/email/index.js`).

**Not covered**

- **No per-account lockout.** The login limit is per IP; a distributed guessing attack against one email isn't slowed beyond bcrypt's cost.
- **No multi-factor authentication**, including for the Super Admin.
- **Registration reveals whether an email has an account** (`409 EMAIL_IN_USE` in `routes/auth.js`). Rate-limited to 5 per IP per hour, but still an enumeration oracle.
- **No email verification at signup.** Someone can register with an address they don't own. Manual approval by the Super Admin is the only check, so the Super Admin should confirm the person out of band before approving.
- No check against breached-password lists.
- Changing the password while logged in isn't implemented (only reset by email).

## 3. Unauthorized access (suspended, pending, expired accounts)

**Threat.** An owner whose account isn't active keeps using the product.

**Protected today**

- `requireActiveAccess` (`middleware/auth.js`) runs on every owner router (`routes/business.js`, `links.js`, `inbox.js`, `export.js`, `analytics.js`). It reads the organization fresh from the database on every request and evaluates expiry at request time (`effectiveAccessStatus()` in `models/Organization.js`), so suspension or expiry takes effect on the very next request; no cron job is involved.
- Public pages of a non-active organization return the generic 404 (`findPublicBusiness()` in `routes/public.js`), with `Cache-Control: no-store`.
- Pending users can log in and call only `GET /api/auth/me` (for the waiting page).
- Tests: `superAdmin.test.js`, and the "refuses logged-out, pending, suspended and Super Admin callers" tests in `export.test.js`, `analytics.test.js`, `feedbackDeletion.test.js`.

**Not covered**

- Nothing material at the API level. The client's route guards (`client/src/components/RouteGuards.jsx`) are convenience only; the server is the enforcement point.

## 4. Session misuse

**Threat.** A stolen or leftover session token is replayed; a session is used from another site (CSRF).

**Protected today**

- Session: HS256 JWT in an `httpOnly` cookie, `secure` in production, `SameSite=lax` by default, 7-day expiry (`utils/session.js`). The token holds only the user id and issue time; role and access status are re-read on every request.
- The server refuses to start without a `JWT_SECRET` of at least 32 characters (`assertSessionConfig()`, called in `index.js`).
- Sessions die with a password reset (`passwordChangedAt`) or account deletion (user no longer found).
- CSRF: with `SameSite=lax` the cookie isn't sent on cross-site `POST`/`PATCH`/`DELETE`; JSON bodies require `Content-Type: application/json`, which a cross-site form can't send without a CORS preflight; CORS allows only `CLIENT_URL` (`app.js`).

**Not covered**

- **No server-side revocation on logout.** `POST /api/auth/logout` only clears the cookie. A token copied before logout stays valid until it expires (up to 7 days) unless the password is reset. A fix needs a token version or session id stored on the user.
- **No CSRF tokens.** Protection relies on `SameSite=lax`. If the client and API are deployed on different sites, `COOKIE_SAMESITE=none` becomes necessary and CSRF tokens must be added first. Sibling subdomains count as the same site, so a compromised subdomain of the same domain could send authenticated requests.
- No idle timeout; sessions are fixed at 7 days.

## 5. Privilege escalation

**Threat.** An owner becomes Super Admin, or acts on another organization through admin routes.

**Protected today**

- No API route assigns or changes a role. Registration reads only `name`, `email`, `password`, `organizationName` and always creates `role: "owner"` with a pending organization (`routes/auth.js`).
- Super Admins are created only by `server/scripts/create-superadmin.js`, which refuses to modify an existing account.
- `/api/super-admin` runs `requireAuth` + `requireSuperAdmin` on every route (`routes/superAdmin.js`). Owner routes run `requireOwner`, so the Super Admin can't use the owner API (it has no organization) and can't read feedback text through any route; it sees counts only (`/overview`).
- Business updates ignore `organizationId`, `publicSlug`, `isActive`, `logoUrl` and any unknown field (`pickBusinessFields()` in `validators/business.js`). Public submissions ignore status fields and notes (`routes/public.js`).
- Tests: `auth.test.js` (role in signup body ignored), `superAdmin.test.js`, `deletion.test.js` (owners refused).

**Not covered**

- Nothing found at the API level.

## 6. Administrator privilege abuse

**Threat.** The Super Admin (or someone with that account) misuses it: approving fake accounts, suspending or deleting real ones, reading data.

**Protected today**

- Every access change and account deletion writes an `AuditLog` entry with actor, action, target, time and non-sensitive context, in the same transaction as the change (`services/accountAccess.js`, `services/accountDeletion.js`).
- Account deletion requires typing the business name exactly (`confirmationNameFor()`), and nothing is deleted on mismatch.
- Audit responses expose only whitelisted context keys and never emails or `actorEmail` (`SAFE_CONTEXT_KEYS` in `services/auditLog.js`).
- The Super Admin can't read feedback text, notes or recordings through the API.

**Not covered**

- **The audit log isn't tamper-evident.** It's an ordinary collection; anyone with database credentials can edit or delete entries.
- **No MFA, no second approver** for deletion or suspension. There is one all-powerful role.
- The Super Admin account itself can't be suspended or have its password changed from the UI; that needs database access (or the reset-by-email flow).
- The provisioning script takes the password as a command-line argument, so it lands in shell history unless cleared (documented in `docs/ARCHITECTURE.md`).
- Anyone with `MONGODB_URI` bypasses all of the above. See section 12.

## 7. Malicious uploads

**Threat.** A customer uploads something other than audio (HTML, script, executable, oversized file) to attack the server, the storage, or the owner's browser.

**Protected today**

- Multer keeps the upload in memory, never on disk until checked; one file, at most 5 MB, at most 10 small text fields (`middleware/audioUpload.js`). The business is checked before the body is read, so unknown pages cost no buffering (`routes/public.js`).
- Declared type must be one of five audio types, **and** the file's magic bytes must match it (`inspectAudio()` in `services/audioFile.js`); size must be plausible for the declared duration (at most 120 s).
- The storage key is generated by the server (`<businessId>/<32 random hex>.<ext>`) and validated against a strict pattern before any file operation, with a second path-prefix check, so no path traversal is possible (`services/storage/keys.js`, `services/storage/local.js`). Files are written with `wx` (never overwrite).
- Recordings are served only through the authorized endpoint with the stored (whitelisted) MIME type, `Content-Disposition: inline`, and Helmet's `X-Content-Type-Options: nosniff`, so a browser won't treat them as HTML.
- A failed database insert removes the stored file (`routes/public.js`).
- Tests: `voice.test.js`.

**Not covered**

- Magic bytes prove the container format, not that the content is benign. There is no transcoding or antivirus scan; a crafted media file that exploits a browser codec bug would reach the owner's browser. Low likelihood, but real.
- Up to 5 MB per concurrent upload is held in RAM. Many simultaneous uploads from many IPs could exhaust memory on a small instance.

## 8. Unauthorized audio access

**Threat.** Someone other than the business owner listens to a recording.

**Protected today**

- Storage is private: `server/private-storage/` is outside every static path and gitignored, and no route serves it directly (`services/storage/index.js`).
- The storage key never leaves the server (not in any response, CSV or audit entry). Keys contain 128 random bits.
- `GET /api/feedback/:id/audio` runs the full owner guard chain and the tenant-scoped `ownFeedback()`; text feedback, another tenant's id and a missing file are all the same `404`. Responses are `Cache-Control: private, no-store` (`routes/inbox.js`).
- Deleting an item, deleting an account and retention all remove the file (`deleteStoredFiles()` in `services/accountDeletion.js`).
- Tests: `voice.test.js`, `feedbackDeletion.test.js`, `deletion.test.js`, `retention.test.js`.

**Not covered**

- **The S3 driver is not implemented** (`services/storage/s3.js` is a stub that refuses every operation). Production therefore stores audio on the API host's local disk: on hosts with ephemeral disks recordings are lost on redeploy, there are no backups, and encryption at rest depends on the host.
- A file that fails to delete is only logged (by key) for manual cleanup.

## 9. Public endpoint abuse and excessive requests

**Threat.** Spam submissions flood a business's inbox; bots exhaust the API, storage or email quota.

**Protected today** (all limits per IP, in `server/src/app.js`)

| Scope | Limit |
|---|---|
| All `/api` | 300 / 15 min |
| `/api/public` | 60 / min |
| Text submission | 10 / 10 min |
| Voice submission | 5 / 10 min |
| Login | 10 / 15 min |
| Register | 5 / hour |
| Forgot password | 5 / hour (plus 3 per account per hour) |
| Reset password | 10 / 15 min |
| CSV export | 30 / 15 min (and at most 10,000 rows) |

- JSON bodies are capped at 100 kB; text fields have length limits (`validators/feedback.js`).
- Idempotency keys stop double submissions being stored twice (unique index in `models/Feedback.js`).
- Owners are capped at 200 links per business (`routes/links.js`).
- The public endpoints return the same 404 for every unavailable case, so they reveal nothing about why.

**Not covered**

- **`trust proxy` is not configured** (`app.js`). Behind a hosting provider's reverse proxy, Express sees the proxy's address, so all visitors share one rate-limit bucket: ten failed logins anywhere would lock everyone out of logging in for 15 minutes, and spam limits would apply globally. This must be set for the specific host before deploying (see HANDOVER.md).
- **No CAPTCHA or bot detection.** An attacker rotating IP addresses can submit spam without bound.
- Rate-limit counters are in memory: they reset on restart and aren't shared between instances.
- No per-business submission cap, and no total storage quota.

## 10. Injection

**Threat.** NoSQL operator injection, regex injection (ReDoS), CSV formula injection, header injection.

**Protected today**

- Every validator checks that values are strings (or exact enums), so objects like `{ "$gt": "" }` and repeated query keys (arrays) are refused before reaching a query (`validators/*.js`). Express 5's default query parser doesn't build nested objects.
- Ids are checked with `mongoose.isValidObjectId()` before use.
- Search input is escaped (`utils/regex.js`) and capped at 200 characters, in the inbox, export, account list and audit log.
- Time zones are validated with `Intl.DateTimeFormat` before reaching `$dateToString` (`validators/inbox.js`, `utils/timeZone.js`).
- CSV cells starting with `=`, `+`, `-`, `@`, tab or CR are neutralized (`utils/csv.js`; test in `export.test.js`).
- The export file name comes from the slug (a strict pattern), not free text.

**Not covered**

- Search is an unindexed case-insensitive regex scan within one business. Bounded and tenant-local, but slow for very large inboxes.

## 11. Cross-site scripting (XSS)

**Threat.** Customer or owner text runs as script in the owner's, admin's or customer's browser.

**Protected today**

- Text is stored as entered and rendered by React as text everywhere; the client has no `dangerouslySetInnerHTML`, `innerHTML` or `eval` (checked by search across `client/src`).
- The only user-controlled `href`s: the Google review link must be `https://` on the server (`checkReviewUrl()` in `validators/business.js`) and is checked again in the client (`isHttpsUrl` in `client/src/lib/landingWording.js`, used by `client/src/pages/FeedbackPage.jsx`), so `javascript:` URLs can't be set; customer emails are rendered as `mailto:` with a fixed prefix.
- `logoUrl` can't be set through the API.
- Email HTML escapes the link (`resetEmail()` in `services/passwordReset.js`).
- Helmet sets security headers on all API responses.

**Not covered**

- **No Content-Security-Policy on the client app.** Helmet's CSP covers API responses only; the static host serving the React build must add its own headers (CSP, `X-Frame-Options`/`frame-ancestors`).

## 12. Infrastructure and secrets

**Protected today**

- `.env` files are gitignored (`.gitignore`); `server/.env.example` and `client/.env.example` contain placeholders only. A scan of the working tree and the full git history of tracked files found no credentials (no connection strings with passwords, API keys, private keys). The only secrets in tests are test-only fixtures (`tests/setup.js` sets a fixed test `JWT_SECRET`; tests use throwaway passwords).
- No secret uses a `VITE_` prefix, so none reaches the browser bundle; `API_PROXY_TARGET` is dev-server only (`client/vite.config.js`).
- Tests refuse to run against a database whose name doesn't end in `_test` (`tests/setup.js`).
- In production, unknown errors return "Internal server error" without details (`middleware/errorHandler.js`).
- `npm audit --omit=dev` reports 0 known vulnerabilities in server and client dependencies (run on 2026-10-22).

**Not covered**

- **MongoDB Atlas network access is open to any IP (0.0.0.0/0).** The database is protected by its credentials alone. Restrict it to the API host's outbound addresses when the host provides static ones.
- If `NODE_ENV` isn't set to `production`, internal error messages are returned to clients and the session cookie isn't marked `secure`.
- `assertSessionConfig()` checks length and the placeholder word, not that the secret differs from the public test secret in `tests/setup.js`.
- No centralized logging or alerting; logs go to stdout.

## 13. Data retention and deletion

**Protected today**

- Account deletion removes every organization-scoped collection, its users' reset tokens, its audit entries and its stored files, in one transaction plus post-commit file removal (`services/accountDeletion.js`; `deletion.test.js` fails if a new model isn't covered).
- Single-item deletion (`DELETE /api/feedback/:id`) removes the record and writes `feedback.deleted` (category and type only) in one transaction, then removes the file. That entry targets the organization, so account deletion removes it too (`feedbackDeletion.test.js`).
- Retention deletes feedback older than `RETENTION_DAYS` with its audio (`services/retention.js`).

**Not covered**

- **Retention only runs while the server process is awake** (at startup and hourly). On hosts that sleep idle services, deletion is delayed until the next wake-up. `node scripts/run-retention.js` can be run by hand or from an external scheduler.
- Atlas backups (if enabled) keep deleted data until the backups expire.
- Owners can't delete their own account; only the Super Admin can.

## Open gaps, by priority

Larger items found during the review, **not fixed** in Phase 6A:

1. **Configure `trust proxy` before deploying** (section 9). Without it, rate limits are effectively global behind a proxy.
2. **Implement the S3-compatible storage driver** (section 8) before production, or recordings live on an ephemeral disk.
3. **Restrict Atlas network access** (section 12).
4. **Server-side session revocation** on logout (section 4).
5. **Bot protection** (CAPTCHA or similar) on public submissions (section 9).
6. **Per-account login throttling** and **MFA for the Super Admin** (sections 2, 6).
7. **Content-Security-Policy** for the client app at the static host (section 11).
8. **Email verification at signup**, and a generic signup response to remove email enumeration (section 2).
9. **Scheduled retention independent of server uptime** (section 13).
10. CSRF tokens become **required** if the client and API are ever on different sites (section 4).
11. Tamper-evident audit log (section 6).
