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
  const data = parseJson(text);
  if (res.ok) return data;
  throw errorFor(res.status, data);
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Not our JSON: typically a proxy or gateway page while the API is down.
    return null;
  }
}

function errorFor(status, data) {
  if (data?.error) {
    return new ApiError(data.error.message, { status, code: data.error.code, details: data.error.details });
  }
  const message =
    status >= 500
      ? "The server is unavailable right now. Please try again in a moment."
      : `Request failed (${status}).`;
  return new ApiError(message, { status, code: status >= 500 ? "SERVER_UNAVAILABLE" : "UNKNOWN" });
}

// A binary response (e.g. a voice recording) as a Blob, sent with the session
// cookie. Errors are ApiErrors, as with api().
export async function apiBlob(path) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { credentials: "include" });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", { code: "NETWORK_ERROR" });
  }
  if (res.ok) return res.blob();
  throw errorFor(res.status, parseJson(await res.text()));
}

// Posts multipart FormData and reports upload progress (0 to 1) along the
// way. fetch() can't report upload progress, so this uses XMLHttpRequest.
export function apiUpload(path, formData, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}${path}`);
    xhr.withCredentials = true;
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      const data = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(errorFor(xhr.status, data));
    };
    const networkError = () =>
      reject(new ApiError("Can't reach the server. Check your connection and try again.", { code: "NETWORK_ERROR" }));
    xhr.onerror = networkError;
    xhr.ontimeout = networkError;
    xhr.send(formData);
  });
}
