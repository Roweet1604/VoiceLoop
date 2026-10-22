# VoiceLoop Handover

How to run VoiceLoop, configure it, create the Super Admin, check the whole customer journey by hand, and where each integration stands. Architecture details are in [ARCHITECTURE.md](ARCHITECTURE.md); security coverage and known gaps are in [THREAT_MODEL.md](THREAT_MODEL.md).

Nothing has been deployed. Everything below was written for, and checked against, a local setup.

## 1. Run locally

**Requirements:** Node.js 20 or newer, npm, and a MongoDB **replica set**. A free MongoDB Atlas cluster works. A standalone local `mongod` does not: access changes, business creation, password reset and deletions use transactions.

```
# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Configure (then edit the values, see section 2)
cp server/.env.example server/.env
cp client/.env.example client/.env      # optional; the defaults work locally

# 3. Generate a JWT secret and paste it into server/.env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Start (two terminals)
cd server && npm run dev     # API on http://localhost:5000
cd client && npm run dev     # UI on http://localhost:5173 (proxies /api to the API)

# 5. Tests and build
cd server && npm test        # Vitest + Supertest against the *_test database
cd client && npm run build   # production build into client/dist
```

On startup the server logs the audio storage driver, transcription status, email provider status and retention period. It refuses to start with a missing or weak `JWT_SECRET`, an unknown `STORAGE_DRIVER`/`TRANSCRIPTION_PROVIDER`/`EMAIL_PROVIDER`, or an invalid `RETENTION_DAYS`. `GET http://localhost:5000/api/health` answers `{ "ok": true }`. For production mode and hosting, see [DEPLOY.md](DEPLOY.md).

Start the server from inside `server/` (as `npm run dev` does): `dotenv` reads `.env` from the current directory.

## 2. Environment variables

Secrets go in `server/.env` locally and in the host's environment settings in production. **Never** put a secret in `client/.env`: every `VITE_` variable is copied into the public JavaScript bundle. Both `.env` files are gitignored; the `.env.example` files contain placeholders only.

### Server (`server/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | **Yes in production** | unset (development) | `production` hides internal error messages, marks the cookie `secure`, and blocks the console email provider. |
| `PORT` | No | `5000` | Port the API listens on. |
| `MONGODB_URI` | **Yes** | none | Atlas connection string. Secret. Without it the server starts but every database request fails. |
| `CLIENT_URL` | **Yes in production** | `http://localhost:5173` | The only browser origin allowed by CORS, and the base of password reset links. No trailing path. |
| `JWT_SECRET` | **Yes** | none | Signs sessions. At least 32 random characters. Secret. Changing it logs everyone out. |
| `COOKIE_SAMESITE` | No | `lax` | Keep `lax` while client and API share a site. `none` needs CSRF protection first (THREAT_MODEL.md §4). |
| `MONGODB_TEST_URI` | No | unset | Test database; name must end in `_test`. If unset, tests use the `MONGODB_URI` cluster with database `voiceloop_test`. |
| `STORAGE_DRIVER` | No | `local` | `local`: files in `server/private-storage/`. `s3`: an S3-compatible bucket such as Cloudflare R2 (see DEPLOY.md). |
| `STORAGE_LOCAL_DIR` | No | `server/private-storage` | Folder for the local driver. Must be private and persistent. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Only with `STORAGE_DRIVER=s3` | unset | Bucket, region (`auto` for R2) and access key. Secret (the keys). |
| `S3_ENDPOINT` | For R2/B2 | unset | The provider's S3 API address. Not needed for AWS S3. |
| `TRUST_PROXY` | In production | off | `1` behind a host's proxy (Render), so rate limits see each visitor. |
| `TRANSCRIPTION_PROVIDER` | No | `none` | Speech-to-text. Only `none` exists. (This is the variable sometimes referred to as "STT_PROVIDER"; the code reads `TRANSCRIPTION_PROVIDER`, and there is no `STT_PROVIDER` variable.) |
| `RETENTION_DAYS` | No | `45` | Feedback (with notes and recording) is deleted this many days after submission. Whole number 1–3650; anything else stops the server. The Privacy Policy and Terms say 45: update them if you change it. |
| `EMAIL_PROVIDER` | **Yes in production** (`resend`) | `console` | `console` prints emails (including reset links) to the server log, development only. `resend` sends through Resend. |
| `RESEND_API_KEY` | With `resend` | unset | Resend API key. Secret. |
| `EMAIL_FROM` | With `resend` | unset | Sender on a domain verified in Resend, e.g. `VoiceLoop <no-reply@yourdomain.com>`. `onboarding@resend.dev` only delivers to your own Resend account address. |

### Client (`client/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_API_URL` | No | empty | Leave empty when the API is served on the same origin under `/api`. Set it only if the built client must call an API on another origin (then see `COOKIE_SAMESITE`). Inlined at build time. |
| `API_PROXY_TARGET` | No | `http://localhost:5000` | Dev server only: where Vite forwards `/api`. Not exposed to the browser. |

## 3. Create the Super Admin

There is no signup or API route for administrators. Create the account from a machine that has `server/.env` with the production `MONGODB_URI`:

```
cd server
node scripts/create-superadmin.js --email admin@yourdomain.com --password "<a long unique password>" --name "Ops Admin"
```

- It refuses to change an existing account, and prints the database name it wrote to.
- The password appears in your shell history. Clear it afterwards (PowerShell: `Clear-History` and delete the line from `(Get-PSReadLineOption).HistorySavePath`; bash: `history -d <n>`), or run the command in a shell that doesn't record history.
- Log in at `/login`; you land on `/super-admin`.
- To rotate the password, use **Forgot password** with the admin email (needs working email).

## 4. Manual smoke test

Run against a fresh database. Use two browsers (or a private window) so the owner and the Super Admin can stay logged in at the same time. Tick each line only when the result comes from the server (reload the page to confirm).

**Signup and approval**

- [ ] `/signup`: create an owner account. You land on the "waiting for approval" page.
- [ ] As that owner, open `/app/dashboard` directly: you're sent back to the waiting page. (API: any owner route returns `403 ACCESS_PENDING`.)
- [ ] As Super Admin, `/super-admin`: the request shows name, email and date, no password data.
- [ ] Approve it for 30 days. The owner's page moves on to business setup after a reload.
- [ ] Super Admin → Audit log shows "Approved access" with the actor and the end date.

**Business setup, link and QR**

- [ ] `/app/setup`: create the business (name, optional welcome message, Google review link starting with `https://`).
- [ ] Dashboard shows zeros and empty states, no invented numbers.
- [ ] `/app/links`: a "Main link" exists. Add a link named "Table 4". Copy its URL.
- [ ] Download the QR code of "Table 4" and scan it with a phone: it opens `/f/<slug>/<code>` for this business.
- [ ] Deactivate "Table 4": its URL now shows "This feedback page isn't available". Reactivate it.

**Text and voice feedback** (logged out, on a phone if possible)

- [ ] Open the "Table 4" URL. The Google review option and the private feedback option are both offered, whatever you intend to say.
- [ ] Submit a **complaint** in text, without name or email. The thank-you screen appears only after the server confirmed.
- [ ] Submit a compliment with a name and email.
- [ ] Record a voice message: allow the microphone, record ~10 s, play it back, discard, record again, submit. Upload progress shows.
- [ ] Deny the microphone permission in another attempt: a clear message appears, text feedback still works.

**Inbox and complaint resolution** (as the owner)

- [ ] `/app/feedback` lists the three items newest first, with source "Table 4".
- [ ] Filters (category, type, source, review, complaint status, dates) and search narrow the list correctly.
- [ ] Open the voice item: the recording plays; transcription says it's unavailable (no transcript is invented).
- [ ] Open the complaint: viewing it does **not** mark it reviewed or change its status.
- [ ] Add an internal note. Mark as reviewed. Start working on it → In progress. Resolve with a summary. Reopen. Resolve again. The history lists every change with your name and time.
- [ ] Log out and open the public page again: no note, status or summary appears anywhere.

**Analytics and export**

- [ ] `/app/analytics`: totals, categories, sources and complaint stats match the three items.
- [ ] Inbox → Export CSV: the file has the three rows, no notes, ids or audio keys. A message starting with `=` appears with a leading `'`.

**Single-item deletion**

- [ ] Open the compliment → Delete feedback. The dialog says it cannot be undone. Cancel: nothing changes.
- [ ] Delete it: you return to the inbox with "The feedback was permanently deleted." It's gone from the inbox, dashboard, analytics and a new CSV export.
- [ ] Delete the voice item: its file disappears from `server/private-storage/<businessId>/`, and its old detail URL shows "Feedback not found".
- [ ] Super Admin → Audit log: "Deleted feedback" shows the category and type only, no text or email.

**Suspension and expiry**

- [ ] Super Admin suspends the account with a reason. The owner's next action fails and they see the suspended page; the public feedback page shows "isn't available".
- [ ] Reactivate: the owner and the public page work again.
- [ ] Expiry: in Atlas, set the organization's `accessExpiresAt` to a time a few minutes in the past (or approve with an end date of tomorrow and check the day after). The owner is blocked on their next request without any job running, and sees the "Access period ended" page; Super Admin shows "Expired". Extend to restore.

**Password reset**

- [ ] `/forgot-password` with the owner email: the same message appears for an unknown email.
- [ ] With `EMAIL_PROVIDER=console` the link is printed in the server log; with `resend` it arrives by email.
- [ ] Open the link, set a new password: logged-in sessions on other browsers are logged out; the link doesn't work a second time; the old password no longer works.

**Retention**

- [ ] `cd server && node scripts/run-retention.js --dry-run` reports what would be deleted and deletes nothing.
- [ ] In a test database, set one item's `submittedAt` to more than 45 days ago, then run `node scripts/run-retention.js` (or restart the server): the item and its recording are gone, newer items remain, and the audit log shows "Deleted expired feedback" with counts only.
- [ ] The detail page shows "Deletes automatically in N days".

**Account deletion**

- [ ] Super Admin → the account → Delete. A wrong name deletes nothing.
- [ ] With the exact business name: the account disappears from the list, the owner's session stops working, the public page is gone, `server/private-storage/<businessId>/` is empty, and the audit log keeps a single "Deleted account" entry (with the business name only).

## 5. Integrations

| Integration | Purpose | Status | Notes |
|---|---|---|---|
| MongoDB Atlas | Database | **Implemented and tested** | The test suite runs against Atlas (`voiceloop_test`). Network access is currently open to all IPs; restrict before production. |
| Local private storage | Voice recordings | **Implemented and tested** | Default driver. Production needs a persistent private disk, or the S3 driver below. |
| S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2) | Production audio storage | **Implemented, awaiting credentials** | `services/storage/s3.js` with `@aws-sdk/client-s3`. Tested with the client mocked; not yet run against a real bucket. Needed on hosts with ephemeral disks (DEPLOY.md). |
| Speech-to-text | Transcripts of voice feedback | **Not implemented** | Only the `none` provider exists. Voice feedback is stored with "Transcription unavailable"; no transcript is ever invented. The provider interface is in `services/transcription/index.js`. |
| Resend | Password reset email | **Implemented, awaiting credentials** | Request format and error handling are tested with a mocked API (`passwordReset.test.js`). Real delivery hasn't been verified: it needs `RESEND_API_KEY`, `EMAIL_FROM` and a verified sending domain. |
| Console email | Development email | **Implemented and tested** | Prints emails to the server log; refuses in production. |
| QR codes (`qrcode` npm library) | QR generation in the browser | **Implemented**, manually verified by scanning | No automated test (client has no test runner). No external service. |
| Browser MediaRecorder | Voice recording | **Implemented**, manual testing only | Supported formats are detected at runtime. No automated browser tests (Playwright is excluded by project rules). |
| Payments, subscriptions | none | **Not implemented, deliberately** | Access is managed by hand by the Super Admin. |

## 6. Before deploying (not done)

These were found in the security review and are not done. Details are in THREAT_MODEL.md.

1. Set `TRUST_PROXY=1` on the host, or rate limits apply to all visitors as one.
2. Set `STORAGE_DRIVER=s3` with an R2 bucket, or use a host with a persistent private disk for `server/private-storage`.
3. Set `NODE_ENV=production`, `CLIENT_URL`, `EMAIL_PROVIDER=resend` with its two values, and a fresh `JWT_SECRET`.
4. Restrict Atlas network access; enable Atlas backups (and note they keep deleted data until they expire).
5. Serve the client with a Content-Security-Policy and `frame-ancestors` header.
6. Keep the API awake or schedule `node scripts/run-retention.js` externally, so retention runs on time.
7. Create the Super Admin with the script, then clear shell history.
