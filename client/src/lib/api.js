// Thin fetch wrapper for the VoiceLoop API.
//
// Resolves with the parsed JSON body (or null for empty responses). Rejects
// with an ApiError carrying the server's { message, code, details }, so pages
// can show the server's own message instead of a generic one.

const BASE_URL = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN", details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", { code: "NETWORK_ERROR" });
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Not our JSON: typically a proxy or gateway page while the API is down.
    }
  }

  if (res.ok) return data;

  if (data?.error) {
    throw new ApiError(data.error.message, { status: res.status, code: data.error.code, details: data.error.details });
  }
  const message =
    res.status >= 500
      ? "The server is unavailable right now. Please try again in a moment."
      : `Request failed (${res.status}).`;
  throw new ApiError(message, { status: res.status, code: res.status >= 500 ? "SERVER_UNAVAILABLE" : "UNKNOWN" });
}
