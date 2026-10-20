// Full public feedback URL, built from the origin the app is being used on:
//   /f/<slug>          the business's main page
//   /f/<slug>/<code>   a specific feedback link
export function publicFeedbackUrl(slug, code) {
  const path = code ? `/f/${encodeURIComponent(slug)}/${encodeURIComponent(code)}` : `/f/${encodeURIComponent(slug)}`;
  return `${window.location.origin}${path}`;
}
