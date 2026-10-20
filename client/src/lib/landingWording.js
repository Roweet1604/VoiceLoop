// Wording for the two cards on the public landing screen. The business can
// override each piece in Settings; an empty value means the default below.
//
// The defaults are deliberately neutral: both options are offered to every
// customer, whatever their experience, and neither is framed as the "happy"
// or "unhappy" path.
export const DEFAULT_WORDING = {
  reviewCardTitle: "Share your experience on Google",
  reviewCardText: "Post a public review that other customers can read. Google opens in a new tab.",
  reviewCardButton: "Write a Google review",
  feedbackCardTitle: "Send private feedback to the team",
  feedbackCardText: "Your message goes only to the team. It's anonymous unless you add your name or email.",
  feedbackCardButton: "Write feedback",
};

export const WORDING_FIELDS = Object.keys(DEFAULT_WORDING);

// The business's wording with defaults filled in for empty fields.
export function resolveWording(source) {
  return Object.fromEntries(
    WORDING_FIELDS.map((field) => [field, source?.[field]?.trim() || DEFAULT_WORDING[field]])
  );
}

// The review card is only offered for a real https link.
export const isHttpsUrl = (value) => typeof value === "string" && value.trim().startsWith("https://");
