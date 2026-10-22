// Settings checked before the server starts. In production a missing
// essential setting stops the server with a clear message, rather than
// starting half-working. JWT_SECRET is checked separately, in every
// environment (utils/session.js assertSessionConfig).
//
// Returns { errors, warnings }: errors stop the server, warnings are logged.
export function checkStartupConfig(env = process.env) {
  const errors = [];
  const warnings = [];
  if (env.NODE_ENV !== "production") return { errors, warnings };

  if (!env.MONGODB_URI) errors.push("MONGODB_URI is not set (the MongoDB Atlas connection string).");
  if (!env.CLIENT_URL) {
    errors.push("CLIENT_URL is not set (the site's public address, e.g. https://voiceloop.onrender.com).");
  }
  if ((env.EMAIL_PROVIDER || "console") === "console") {
    warnings.push(
      'EMAIL_PROVIDER is "console" in production, so password reset emails are NOT sent (and links are never ' +
        "printed to the log). Until an email provider is set up, give owners a link from Super Admin > Accounts > " +
        "More > Reset link."
    );
  }
  if (!env.TRUST_PROXY) {
    warnings.push(
      "TRUST_PROXY is not set. Behind a host's proxy (Render, Railway, Fly, ...) set TRUST_PROXY=1, or every " +
        "visitor shares one rate limit."
    );
  }
  return { errors, warnings };
}

// TRUST_PROXY -> Express "trust proxy" setting. Off by default. "1" (one proxy
// in front, as on Render) is the usual production value; "true" trusts every
// proxy, which lets clients fake their address, so prefer a hop count.
// Other values (e.g. "loopback" or a list of subnets) go to Express as is.
export function trustProxySetting(value) {
  if (value === undefined || value === "" || value === "false" || value === "0") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}
