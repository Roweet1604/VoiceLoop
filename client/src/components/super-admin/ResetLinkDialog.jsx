import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import Dialog, { DialogFooter } from "../ui/Dialog.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import PublicLink from "../PublicLink.jsx";
import { api } from "../../lib/api.js";
import { formatDate, formatTime } from "../../lib/format.js";

// Creates a password reset link for the account's owner (nothing is
// emailed). The server returns the link once; it lives only in this
// component's state and is gone when the dialog closes.
export default function ResetLinkDialog({ account, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null); // { link, expiresAt }
  const ownerEmail = account.owner?.email;

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { link, expiresAt } = await api(`/api/super-admin/accounts/${account.id}/reset-link`, { method: "POST" });
      setCreated({ link, expiresAt });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <Dialog title="Password reset link" onClose={onClose}>
        <div className="space-y-4 px-6 pt-3 text-sm">
          <div className="flex items-start gap-2 rounded-control border border-danger/30 bg-dangerSoft px-3 py-2.5 text-danger">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Copy it now. This link won't be shown again; closing this window discards it.</p>
          </div>
          <PublicLink url={created.link} label="Password reset link" />
          <p className="text-muted">
            Works once, until {formatDate(created.expiresAt)}, {formatTime(created.expiresAt)}.
            {ownerEmail && <> Send it only to {ownerEmail}.</>}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </Dialog>
    );
  }

  return (
    <Dialog title="Create password reset link" busy={submitting} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="space-y-3 px-6 pt-3 text-sm">
          <p className="text-text">
            Creates a link for the owner of <strong className="font-medium">{account.businessName ?? account.name}</strong>
            {ownerEmail && <> ({ownerEmail})</>}. No email is sent.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Whoever has the link can set this account's password.</li>
            <li>It is valid for 30 minutes and works once. Any earlier unused link stops working.</li>
            <li>Using it logs the owner out everywhere.</li>
            <li>Send it only to the account owner, through a channel you trust.</li>
          </ul>
          {error && <Alert>{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create link
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
