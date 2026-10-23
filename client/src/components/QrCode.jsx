import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Download, LoaderCircle, Printer } from "lucide-react";
import Button from "./ui/Button.jsx";

// Rendered large so the PNG prints sharply; the preview is scaled down with CSS.
const PNG_SIZE = 1024;
const QR_OPTIONS = {
  errorCorrectionLevel: "M", // survives some smudging or a small logo sticker
  margin: 2, // modules of quiet zone around the code
  width: PNG_SIZE,
  color: { dark: "#000000", light: "#ffffff" }, // maximum contrast for scanners
};

// QR code for `url`, generated in the browser, with a PNG download and a
// print sheet (styles in index.css, "QR print sheet") titled `printTitle`.
export default function QrCode({ url, filename, printTitle, dimmed = false }) {
  const [state, setState] = useState({ dataUrl: null, error: null });
  const [printing, setPrinting] = useState(false);

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

  // Mount the print sheet first, then open the dialog once it is in the DOM.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  return (
    // The tile is white in both themes (bg-white is a fixed colour, not a
    // theme token) so the code always scans.
    <div className="flex w-[150px] shrink-0 flex-col items-stretch gap-2">
      <div
        className={`flex h-[150px] w-[150px] items-center justify-center rounded-control border border-border bg-white p-1.5 ${dimmed ? "opacity-40" : ""}`}
      >
        {state.dataUrl && <img src={state.dataUrl} alt={`QR code for ${url}`} className="h-full w-full" />}
        {!state.dataUrl && !state.error && (
          <LoaderCircle className="h-4 w-4 animate-spin text-faint" aria-label="Generating QR code" />
        )}
        {state.error && <p className="px-2 text-center text-xs text-danger">Couldn't generate QR code</p>}
      </div>
      <Button variant="secondary" size="sm" onClick={download} disabled={!state.dataUrl} className="w-full whitespace-nowrap">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Download PNG
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setPrinting(true)} disabled={!state.dataUrl} className="w-full whitespace-nowrap">
        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        Print
      </Button>
      {printing &&
        createPortal(
          <div className="qr-print-sheet">
            <img src={state.dataUrl} alt="" />
            <h1>{printTitle}</h1>
            <p>Scan to share your feedback</p>
          </div>,
          document.body,
        )}
    </div>
  );
}
