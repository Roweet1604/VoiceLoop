import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, LoaderCircle, Pencil, Power, X } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import PublicLink from "../components/PublicLink.jsx";
import QrCode from "../components/QrCode.jsx";
import StatusPill from "../components/ui/StatusPill.jsx";
import { LinkNameDialog, ToggleLinkDialog } from "../components/links/LinkDialogs.jsx";
import { useBusiness, useHandleAccessError } from "../context/BusinessContext.jsx";
import { api } from "../lib/api.js";
import { publicFeedbackUrl } from "../lib/publicUrl.js";

const NOTICES = {
  created: (link) => `Created "${link.name}".`,
  renamed: (link) => `Renamed to "${link.name}".`,
  deactivated: (link) => `Deactivated "${link.name}". Its feedback is kept.`,
  activated: (link) => `Activated "${link.name}".`,
};

// "Table 4" -> "table-4", for download filenames.
const fileSafe = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "link";

export default function LinksPage() {
  const { business } = useBusiness();
  const handleAccessError = useHandleAccessError();
  const [state, setState] = useState({ loading: true, links: null, error: null });
  const [dialog, setDialog] = useState(null); // { type: "create" | "rename" | "toggle", link? }
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { links } = await api("/api/links");
      setState({ loading: false, links, error: null });
    } catch (err) {
      handleAccessError(err);
      setState((s) => ({ ...s, loading: false, error: err }));
    }
  }, [handleAccessError]);

  useEffect(() => {
    load();
  }, [load]);

  // Update the list from the server's confirmed response.
  function handleSaved(saved, kind) {
    setDialog(null);
    setNotice(NOTICES[kind](saved));
    setState((s) => ({
      ...s,
      links: kind === "created" ? [...s.links, saved] : s.links.map((l) => (l.id === saved.id ? saved : l)),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-text">Links and QR codes</h1>
          <p className="mt-1 text-sm text-muted">
            Use a separate link for each place or channel to see where feedback comes from.
          </p>
        </div>
        <Button onClick={() => setDialog({ type: "create" })} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New link
        </Button>
      </div>

      {notice && (
        <Alert tone="success">
          <div className="flex items-start justify-between gap-3">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="rounded-sm text-okText hover:opacity-70 focus-visible:outline-2 focus-visible:outline-accent">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Alert>
      )}

      {state.error && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Alert className="flex-1">{state.error.message}</Alert>
          <Button variant="secondary" onClick={load} loading={state.loading}>
            {!state.loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            Retry
          </Button>
        </div>
      )}

      {state.loading && !state.links && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading links…
        </div>
      )}

      {state.links?.length === 0 && (
        <Card className="text-center">
          <p className="text-sm text-muted">No links yet. Create one to get a shareable address and QR code.</p>
        </Card>
      )}

      {state.links && state.links.length > 0 && (
        // Cards at least 430px wide: 2 columns at 1100px, 3 from 1500px.
        <ul className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,430px),1fr))]">
          {state.links.map((link) => (
            <li key={link.id} className="flex">
              <LinkCard
                link={link}
                url={publicFeedbackUrl(business.publicSlug, link.code)}
                filename={`${business.publicSlug}-${fileSafe(link.name)}-qr.png`}
                onRename={() => setDialog({ type: "rename", link })}
                onToggle={() => setDialog({ type: "toggle", link })}
              />
            </li>
          ))}
        </ul>
      )}

      {dialog?.type === "create" && <LinkNameDialog onClose={() => setDialog(null)} onSaved={handleSaved} />}
      {dialog?.type === "rename" && (
        <LinkNameDialog link={dialog.link} onClose={() => setDialog(null)} onSaved={handleSaved} />
      )}
      {dialog?.type === "toggle" && (
        <ToggleLinkDialog link={dialog.link} onClose={() => setDialog(null)} onSaved={handleSaved} />
      )}
    </div>
  );
}

function LinkCard({ link, url, filename, onRename, onToggle }) {
  return (
    // QR beside the details when the card is wide enough, stacked otherwise.
    <Card className="@container w-full p-5">
      <div className="flex flex-col gap-5 @[24rem]:flex-row">
        <QrCode url={url} filename={filename} dimmed={!link.isActive} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold break-words text-text">{link.name}</h2>
            {link.isDefault && <StatusPill>Main</StatusPill>}
            <StatusPill tone={link.isActive ? "ok" : "neutral"}>{link.isActive ? "Active" : "Inactive"}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-muted">
            {link.feedbackCount} {link.feedbackCount === 1 ? "submission" : "submissions"}
          </p>

          <div className="mt-3">
            <PublicLink url={url} label={`Link for ${link.name}`} />
          </div>
          {!link.isActive && (
            <p className="mt-2 text-xs text-muted">
              Inactive: customers using this link or QR code see “This feedback page isn't available”.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button variant="secondary" size="sm" onClick={onRename} aria-label={`Rename ${link.name}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Rename
            </Button>
            <Button variant="secondary" size="sm" onClick={onToggle} aria-label={`${link.isActive ? "Deactivate" : "Activate"} ${link.name}`}>
              <Power className="h-3.5 w-3.5" aria-hidden="true" />
              {link.isActive ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
