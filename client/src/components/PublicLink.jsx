import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import Button from "./ui/Button.jsx";
import { inputClasses } from "./ui/TextField.jsx";

// Read-only URL with a copy button. If the clipboard isn't available (e.g.
// an insecure origin), the URL is selected so it can be copied by hand.
export default function PublicLink({ url, label = "Public feedback link" }) {
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
          aria-label={label}
          onFocus={(e) => e.target.select()}
          className={`${inputClasses} min-w-0 border-border-strong bg-canvas font-mono text-xs`}
        />
        <Button variant="secondary" onClick={copy} className="shrink-0" aria-label={`Copy ${label.toLowerCase()}`}>
          {status === "copied" ? (
            <Check className="h-4 w-4 text-success" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {status === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs" role="status">
        {status === "failed" ? (
          <span className="mt-1.5 block text-danger">
            Couldn't copy automatically. The link is selected; copy it with Ctrl+C or ⌘C.
          </span>
        ) : (
          <span className="sr-only">{status === "copied" ? "Link copied" : ""}</span>
        )}
      </p>
    </div>
  );
}
