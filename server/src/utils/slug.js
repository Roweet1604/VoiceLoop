import crypto from "node:crypto";

const MAX_BASE_LENGTH = 50;
const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

// "Café Ñandú & Co." -> "cafe-nandu-co". Falls back to "business" when nothing
// usable is left (e.g. a name written entirely in a non-Latin script).
export function slugify(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents left over from NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/, "");
  return slug || "business";
}

// Short random suffix used when a slug is already taken, e.g. "corner-cafe-k3x9q".
export function randomSuffix(length = 5) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join("");
}

// Public slugs only ever contain these characters; anything else can't match.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
