import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import Button from "./ui/Button.jsx";
import { inputClasses } from "./ui/TextField.jsx";

export function publicFeedbackUrl(slug) {
  return `${window.location.origin}/f/${slug}`;
}

// Read-only public link with a copy button. If the clipboard isn't available
// (e.g. an insecure origin), the link is selected so it can be copied by hand.
export default function PublicLink({ slug }) {
  const url = publicFeedbackUrl(slug);
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | copied | failed

  useEffect(() => {
    if (status !== "copied") return;
    const timer = setTimeout(() => setStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      inputRef.current?.select();
      setStatus("failed");
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="Public feedback link"
          onFocus={(e) => e.target.select()}
          className={`${inputClasses} border-border-strong bg-canvas font-mono text-xs`}
        />
        <Button variant="secondary" onClick={copy} className="shrink-0">
          {status === "copied" ? (
            <Check className="h-4 w-4 text-success" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {status === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-1.5 text-xs" role="status">
        {status === "failed" ? (
          <span className="text-danger">Couldn't copy automatically. The link is selected; copy it with Ctrl+C or ⌘C.</span>
        ) : (
          <span className="sr-only">{status === "copied" ? "Link copied" : ""}</span>
        )}
      </p>
    </div>
  );
}
