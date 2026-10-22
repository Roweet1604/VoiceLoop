// Light/dark theme. A saved choice sets data-theme on <html>; with nothing
// saved the attribute is absent and theme.css follows the OS setting.
// index.html applies the saved choice before React loads, with the same key.

export const THEME_STORAGE_KEY = "voiceloop-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// localStorage can throw (private mode, blocked site data), so every access
// is guarded and failure just means "nothing saved".
export function getSavedTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme() {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not saved; the choice still applies until the page reloads.
  }
}

// Calls `onChange` when the OS setting changes. Returns an unsubscribe function.
export function watchSystemTheme(onChange) {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  const listener = () => onChange(query.matches ? "dark" : "light");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
