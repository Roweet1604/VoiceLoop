import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, LoaderCircle } from "lucide-react";
import Button from "./ui/Button.jsx";

// Rendered large so the PNG prints sharply; the preview is scaled down with CSS.
const PNG_SIZE = 1024;
const QR_OPTIONS = {
  errorCorrectionLevel: "M", // survives some smudging or a small logo sticker
  margin: 2, // modules of quiet zone around the code
  width: PNG_SIZE,
  color: { dark: "#000000", light: "#ffffff" }, // maximum contrast for scanners
};

// QR code for `url`, generated in the browser, with a PNG download.
export default function QrCode({ url, filename, dimmed = false }) {
  const [state, setState] = useState({ dataUrl: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ dataUrl: null, error: null });
    QRCode.toDataURL(url, QR_OPTIONS)
      .then((dataUrl) => !cancelled && setState({ dataUrl, error: null }))
      .catch((error) => !cancelled && setState({ dataUrl: null, error }));
    return () => {
      cancelled = true;
    };
  }, [url]);

  function download() {
    const anchor = document.createElement("a");
    anchor.href = state.dataUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <div className="flex w-32 shrink-0 flex-col items-center gap-2">
      <div
        className={`flex h-32 w-32 items-center justify-center rounded-md border border-border bg-white p-1 ${dimmed ? "opacity-40" : ""}`}
      >
        {state.dataUrl && <img src={state.dataUrl} alt={`QR code for ${url}`} className="h-full w-full" />}
        {!state.dataUrl && !state.error && (
          <LoaderCircle className="h-4 w-4 animate-spin text-ink-subtle" aria-label="Generating QR code" />
        )}
        {state.error && <p className="px-2 text-center text-xs text-danger">Couldn't generate QR code</p>}
      </div>
      <Button variant="secondary" size="sm" onClick={download} disabled={!state.dataUrl} className="w-full">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Download PNG
      </Button>
    </div>
  );
}
