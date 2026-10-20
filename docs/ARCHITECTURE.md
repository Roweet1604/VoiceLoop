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
│   └── src/
│       ├── index.js            App setup: security middleware, routes, error handling, startup
│       ├── config/db.js        MongoDB connection via Mongoose
│       ├── routes/             One router per resource, mounted under /api
│       ├── middleware/         notFound, errorHandler, validate
│       └── utils/AppError.js   Error class for expected 4xx errors
└── docs/                       Project documentation
```

## How the client and server communicate

- In development the client runs on the Vite dev server (`http://localhost:5173`) and the API runs on Express (`http://localhost:5000`).
- The client calls the API directly with `fetch` using `VITE_API_URL` as the base URL. There is no Vite proxy, so this is a cross-origin request.
- The server allows that origin through CORS, restricted to the single origin in `CLIENT_URL`. Requests from any other browser origin are refused by the browser.
- All API routes live under `/api` and exchange JSON. Request bodies are limited to 100 kB.

### Request pipeline (server)

Each request passes through, in order:

1. `helmet`: sets security headers.
2. `cors`: allows only `CLIENT_URL`.
3. Rate limiter on `/api`: 300 requests per IP per 15 minutes, then `429`. It runs before body parsing so malformed or oversized requests are counted too.
4. `express.json({ limit: "100kb" })`: parses JSON bodies.
5. Route handlers, e.g. `/api/health`.
6. `notFound`: any unmatched route becomes a `404`.
7. `errorHandler`: turns every error into the standard JSON shape and logs it.

### Response shapes

Success responses are route-specific JSON, e.g. `GET /api/health` returns `{ "status": "ok" }`.

Every error uses one shape:

```json
{ "error": { "message": "Route not found: GET /api/nope", "code": "NOT_FOUND" } }
```

Validation failures add a `details` object keyed by field. Error codes currently in use: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `INVALID_JSON`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Stack traces are never sent to the client. They are logged on the server. When `NODE_ENV=production`, unexpected (500) errors also replace their message with `"Internal server error"`.

### Error and validation conventions (server)

- Throw `AppError.badRequest()`, `.unauthorized()`, `.forbidden()` or `.notFound()` for expected failures. Express 5 forwards errors thrown in async handlers to `errorHandler` automatically.
- Validate input with `validate({ body, query, params })` from `middleware/validate.js`. Each validator is a plain function that returns `{ field: "problem" }`; see the comment in that file for an example.

## Environment variables

### Server (`server/.env`, template in `server/.env.example`)

| Variable      | Required | Default                 | Purpose |
|---------------|----------|-------------------------|---------|
| `NODE_ENV`    | No       | unset (development)     | Set to `production` to hide internal error messages. |
| `PORT`        | No       | `5000`                  | Port the API listens on. |
| `MONGODB_URI` | Yes, for the database | unset          | MongoDB connection string. If unset, the server starts without a database and logs a warning. |
| `CLIENT_URL`  | No       | `http://localhost:5173` | The only browser origin allowed by CORS. |
| `JWT_SECRET`  | Not yet  | none                    | Reserved for authentication; not read by any code yet. |

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
```
