// Outgoing email behind one interface:
//
//   sendEmail({ to, subject, text, html, idempotencyKey? }) -> { id }
//
// EMAIL_PROVIDER picks the provider:
//   "console" (default)  development only: prints the message, links
//                        included, to the server log. Refuses in production.
//   "resend"             Resend's REST API (needs RESEND_API_KEY, EMAIL_FROM).
//
// A provider that can't send throws EmailNotConfiguredError and logs why. API
// keys and, in production, message contents are never logged.

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;

export class EmailNotConfiguredError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmailNotConfiguredError";
  }
}

export class EmailSendError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmailSendError";
  }
}

function refuse(message) {
  console.error(`[email] Not sent: ${message}`);
  throw new EmailNotConfiguredError(message);
}

function consoleProvider(env) {
  return {
    name: "console",
    async send({ to, subject, text }) {
      if (env.NODE_ENV === "production") {
        // Never print links (which grant access) to production logs.
        refuse('EMAIL_PROVIDER is "console", which is for development only. Set EMAIL_PROVIDER=resend in production.');
      }
      console.info(
        ["", "[email] ---- development email (not sent) ----", `To: ${to}`, `Subject: ${subject}`, "", text, "[email] ----------------------------------------", ""].join("\n")
      );
      return { id: null };
    },
  };
}

function resendProvider(env, fetchImpl) {
  return {
    name: "resend",
    async send({ to, subject, text, html, idempotencyKey }) {
      const apiKey = env.RESEND_API_KEY;
      if (!apiKey) refuse("RESEND_API_KEY is not set.");
      if (!env.EMAIL_FROM) refuse("EMAIL_FROM is not set.");

      let res;
      try {
        res = await fetchImpl(RESEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
          },
          body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, html }),
          signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });
      } catch (err) {
        throw new EmailSendError(`Resend request failed: ${err.name}`);
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Resend's error name and message describe the problem (e.g. an
        // unverified domain); they never contain the API key.
        const reason = [data?.name, data?.message].filter(Boolean).join(": ") || "no details";
        throw new EmailSendError(`Resend responded ${res.status} (${reason})`);
      }
      return { id: data?.id ?? null };
    },
  };
}

export function createEmailSender(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const provider = env.EMAIL_PROVIDER || "console";
  if (provider === "console") return consoleProvider(env);
  if (provider === "resend") return resendProvider(env, fetchImpl);
  throw new Error(`Unknown EMAIL_PROVIDER "${provider}" (use "console" or "resend")`);
}

let sender = null;

// The configured provider, created on first use.
export function getEmailSender() {
  sender ??= createEmailSender();
  return sender;
}

export const sendEmail = (message) => getEmailSender().send(message);

// For the startup log: can this configuration actually deliver email?
export function emailStatus(env = process.env) {
  const provider = env.EMAIL_PROVIDER || "console";
  if (provider === "console") {
    return env.NODE_ENV === "production"
      ? { ok: false, message: 'EMAIL_PROVIDER is "console" in production: no email will be sent' }
      : { ok: true, message: "console (development: emails are printed here, not sent)" };
  }
  const missing = ["RESEND_API_KEY", "EMAIL_FROM"].filter((name) => !env[name]);
  return missing.length
    ? { ok: false, message: `resend is missing ${missing.join(", ")}: no email will be sent` }
    : { ok: true, message: "resend" };
}
