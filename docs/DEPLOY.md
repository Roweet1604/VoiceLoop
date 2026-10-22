# Deploying VoiceLoop (free tier first)

This puts the whole site (pages and API) on **one free Render web service**, the database on **MongoDB Atlas free**, and, optionally, voice recordings in **Cloudflare R2**. Prices and free allowances change: check each provider's current pricing page before you rely on them.

## How it fits together

- **Render** runs the Node server. In production it also serves the built React app, so everything is on one address, e.g. `https://voiceloop.onrender.com`.
- **MongoDB Atlas** (free M0 cluster) stores accounts, businesses and feedback.
- **Voice recordings** are files. Render's free disk is wiped on every restart and deploy, so recordings saved there **disappear**. Use **R2** for them, or accept that voice recordings are temporary while testing.
- **Email**: there is no real email provider yet. Password reset emails are not sent in production; the Super Admin gives owners a link instead (Accounts → More → Reset link).

## Warnings for the free tier

- **Cold starts.** A free Render service goes to sleep after about 15 minutes without visits. The next visitor waits up to about a minute while it wakes. A customer scanning a QR code may see a slow first page.
- **Ephemeral disk.** Anything written to the server's own disk is lost on restart or redeploy. That's why recordings should go to R2.
- **Retention runs while awake.** Automatic deletion after 45 days runs when the server starts and then on a timer, so on a sleeping service it runs late (on the next wake).
- **Rate limits reset** when the service restarts (they are kept in memory).
- **Atlas network access.** Render's free services have no fixed outgoing address, so Atlas must allow access from anywhere (`0.0.0.0/0`). Use a long, unique database password.

## 1. Database: MongoDB Atlas (free)

1. Create a free account at mongodb.com/atlas and a free **M0** cluster.
2. **Database Access** → add a user with a long random password (read and write to any database).
3. **Network Access** → add `0.0.0.0/0` (see the warning above).
4. **Connect** → Drivers → copy the connection string. Put your user and password in it and add a database name, e.g. `.../voiceloop?retryWrites=true&w=majority`. This is `MONGODB_URI`.

## 2. Optional: recordings in Cloudflare R2

R2's free allowance (at the time of writing, about 10 GB stored and millions of reads and writes per month, no download fees) is far more than early use needs. Cloudflare asks for a payment card to turn R2 on, even on the free allowance.

1. In the Cloudflare dashboard → **R2** → create a bucket, e.g. `voiceloop-audio`. Leave public access **off**.
2. **R2 → Manage API tokens** → create a token with **Object Read & Write** on that bucket only. Copy the **Access Key ID** and **Secret Access Key** (shown once).
3. Note your account's S3 API address: `https://<account id>.r2.cloudflarestorage.com`.

## 3. The web service: Render (free)

1. Push this repository to GitHub.
2. At render.com → **New → Web Service** → connect the repository.
3. Settings:
   - **Root directory:** leave empty (the project folder).
   - **Runtime:** Node.
   - **Build command:** `npm --prefix server ci && npm --prefix client ci --include=dev && npm run build`
     (`--include=dev` because the client's build tools are dev dependencies.)
   - **Start command:** `npm start`
   - **Instance type:** Free.
   - **Health check path:** `/api/health`
4. **Environment variables** (Render → Environment). `npm start` sets `NODE_ENV=production` itself.

| Variable | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `MONGODB_URI` | from Atlas, step 1 |
| `JWT_SECRET` | a new random string: run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` on your computer |
| `CLIENT_URL` | your Render address, e.g. `https://voiceloop.onrender.com` (no trailing slash) |
| `TRUST_PROXY` | `1` |
| `EMAIL_PROVIDER` | `console` (for now; the server starts with a warning) |
| `RETENTION_DAYS` | `45` |
| `STORAGE_DRIVER` | `s3` with R2, or leave unset (recordings are then temporary) |
| `S3_ENDPOINT` | with R2: `https://<account id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | with R2: `voiceloop-audio` |
| `S3_REGION` | with R2: `auto` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | with R2: from step 2 |

5. **Create Web Service.** The first build takes a few minutes. In the log you should see `Client: serving the built app …` and `Server listening …`. The `[config] Warning:` line about email is expected.
6. If the log says `[config] … is not set` and `Not starting`, add the missing variable and redeploy.

## 4. Create the Super Admin

On your computer, in `server/`, temporarily point `.env`'s `MONGODB_URI` at the Atlas database and run:

```
node scripts/create-superadmin.js --email you@example.com --password "<a long unique password>" --name "Your Name"
```

Then set `.env` back, and clear the command from your shell history (see HANDOVER.md §3).

## 5. Check it

1. Open `https://<your service>.onrender.com/api/health`. **See:** `{"ok":true}`.
2. Open the address itself. **See:** the landing page.
3. Log in as the Super Admin, then work through `docs/SMOKE_TEST_CHECKLIST.md`, using the Render address instead of the local ones. With R2, voice recording works on phones too, because the site is on https.

## Moving to paid later

When real customers depend on it:

- [ ] **Render paid instance** (e.g. Starter): no sleeping, no cold starts.
- [ ] **Recordings in R2** (or another S3-compatible bucket), if not already.
- [ ] **Real email**: a Resend account with a verified domain; set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`.
- [ ] **Your own domain** on Render, then update `CLIENT_URL`.
- [ ] **Atlas paid tier** (M10 or higher) for backups and, with fixed outgoing addresses from your host, restrict Network Access instead of `0.0.0.0/0`.
- [ ] **Retention on a schedule**: a Render cron job running `node scripts/run-retention.js` daily, so deletion never waits for a wake-up.
- [ ] **Monitoring**: an uptime check on `/api/health` and an error tracker.
- [ ] Fill in the `[BRACKETS]` in the Privacy Policy and Terms and have them reviewed.
- [ ] Re-read `docs/THREAT_MODEL.md` and `docs/HANDOVER.md` §6.
