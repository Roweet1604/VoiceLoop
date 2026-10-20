// Wording for the two cards on the public landing screen. Titles and buttons
// are fixed; the business can only change each card's text in Settings, and
// an empty text means the default below.
//
// Note: this wording was chosen by the product owner. It associates the
// Google card with compliments and the private card with complaints, which
// conflicts with CLAUDE.md §9 ("never filter customers based on sentiment")
// and Google's review policies. See docs/ARCHITECTURE.md → Businesses.
export const FIXED_WORDING = {
  reviewCardTitle: "Google Review",
  reviewCardButton: "Yes! Why not",
  feedbackCardTitle: "Complaint/Personal Feedback",
  feedbackCardButton: "Suggest",
};

export const DEFAULT_TEXT = {
  reviewCardText: "Liked the service, Wanna compliment",
  feedbackCardText: "Yes i have complaint or suggestion",
};

export const TEXT_FIELDS = Object.keys(DEFAULT_TEXT);

// Everything the cards show: fixed titles and buttons, plus the business's
// text with defaults filled in for empty values.
export function resolveWording(source) {
  return {
    ...FIXED_WORDING,
    ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, source?.[field]?.trim() || DEFAULT_TEXT[field]])),
  };
}

// The review card is only offered for a real https link.
export const isHttpsUrl = (value) => typeof value === "string" && value.trim().startsWith("https://");
