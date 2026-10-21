import { useEffect } from "react";

// Sets the tab title and meta description while a page is shown, and puts
// back the previous values when it goes away, so pages that set nothing keep
// the defaults from index.html.
export function usePageMeta(title, description) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const meta = description ? document.querySelector('meta[name="description"]') : null;
    const previousDescription = meta?.getAttribute("content");
    meta?.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (meta && previousDescription != null) meta.setAttribute("content", previousDescription);
    };
  }, [title, description]);
}
