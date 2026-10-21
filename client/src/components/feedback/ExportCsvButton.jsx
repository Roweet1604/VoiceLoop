import { useState } from "react";
import { Download } from "lucide-react";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import { apiDownload, saveBlob } from "../../lib/api.js";

const numberFormat = new Intl.NumberFormat();

// `attachment; filename="x.csv"` -> "x.csv". The server only uses safe characters.
function filenameFrom(disposition) {
  const match = /filename="([^"]+)"/.exec(disposition ?? "");
  return match ? match[1] : "voiceloop-feedback.csv";
}

// Downloads the inbox's current filters as CSV. The file is saved only once
// the server has sent all of it; a cut-off download shows an error instead.
export default function ExportCsvButton({ query, disabled, onAccessError }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  async function exportCsv() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { blob, headers } = await apiDownload(`/api/feedback/export.csv?${query}`);
      saveBlob(blob, filenameFrom(headers.get("Content-Disposition")));
      if (headers.get("X-Export-Truncated") === "true") {
        const [rows, total] = ["X-Export-Rows", "X-Export-Total"].map((h) => numberFormat.format(Number(headers.get(h))));
        setNotice(
          `The file has the newest ${rows} of ${total} matching items, the most one export can hold. Narrow the date range to export the rest.`
        );
      }
    } catch (err) {
      onAccessError(err);
      setError(err.status === 429 ? "You've exported several times in a short while. Please wait a few minutes." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button variant="secondary" onClick={exportCsv} loading={busy} disabled={disabled}>
        {!busy && <Download className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Preparing CSV…" : "Export CSV"}
      </Button>
      {error && <Alert className="sm:max-w-sm">{error}</Alert>}
      {notice && (
        <Alert tone="info" className="sm:max-w-sm">
          {notice}
        </Alert>
      )}
    </div>
  );
}
