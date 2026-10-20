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
│   │   ├── models/             Mongoose models (User, Organization)
│   │   ├── routes/             One router per resource, mounted under /api
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

### Response shapes

Success responses are route-specific JSON, e.g. `GET /api/health` returns `{ "status": "ok" }`.

Every error uses one shape:

```json
{ "error": { "message": "Route not found: GET /api/nope", "code": "NOT_FOUND" } }
```

Validation failures add a `details` object keyed by field. Error codes currently in use: `BAD_REQUEST`, `UNAUTHORIZED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `ACCESS_PENDING`, `ACCESS_REJECTED`, `ACCESS_SUSPENDED`, `ACCESS_EXPIRED`, `NO_ORGANIZATION`, `NOT_FOUND`, `EMAIL_IN_USE`, `PAYLOAD_TOO_LARGE`, `INVALID_JSON`, `RATE_LIMITED`, `INTERNAL_ERROR`.

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
