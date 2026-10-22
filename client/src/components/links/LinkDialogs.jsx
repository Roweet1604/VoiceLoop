import { useState } from "react";
import Dialog, { DialogFooter } from "../ui/Dialog.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import TextField from "../ui/TextField.jsx";
import { useForm } from "../../hooks/useForm.js";
import { useHandleAccessError } from "../../context/BusinessContext.jsx";
import { api } from "../../lib/api.js";
import { validateLinkName, LINK_NAME_MAX } from "../../lib/validation.js";

// Create a link (no `link`) or rename one.
export function LinkNameDialog({ link, onClose, onSaved }) {
  const handleAccessError = useHandleAccessError();
  const { bind, handleSubmit, submitting, formError } = useForm({ name: link?.name ?? "" }, validateLinkName);

  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      const { link: saved } = link
        ? await api(`/api/links/${link.id}`, { method: "PATCH", body: { name: name.trim() } })
        : await api("/api/links", { method: "POST", body: { name: name.trim() } });
      onSaved(saved, link ? "renamed" : "created");
    } catch (err) {
      handleAccessError(err);
      throw err;
    }
  });

  return (
    <Dialog
      title={link ? "Rename link" : "New link"}
      description={
        link
          ? "Only you see this name. The link's address and QR code stay the same."
          : "Create a separate link and QR code for a place or channel, e.g. Reception, Table 4 or Website. Only you see the name."
      }
      busy={submitting}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="space-y-4 px-6 pt-4">
          {formError && <Alert>{formError}</Alert>}
          <TextField label="Link name" maxLength={LINK_NAME_MAX} autoFocus {...bind("name")} />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {link ? "Save name" : "Create link"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

// Confirm activating or deactivating a link.
export function ToggleLinkDialog({ link, onClose, onSaved }) {
  const handleAccessError = useHandleAccessError();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const deactivating = link.isActive;

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { link: saved } = await api(`/api/links/${link.id}`, {
        method: "PATCH",
        body: { isActive: !link.isActive },
      });
      onSaved(saved, deactivating ? "deactivated" : "activated");
    } catch (err) {
      handleAccessError(err);
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog title={deactivating ? `Deactivate "${link.name}"?` : `Activate "${link.name}"?`} busy={submitting} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="space-y-3 px-6 pt-3 text-sm text-muted">
          {deactivating ? (
            <>
              <p>
                Customers who open this link or scan its QR code will see “This feedback page isn't available” and
                won't be able to send feedback through it.
              </p>
              {link.isDefault && (
                <p>This is your main link, so your business's main feedback address will stop working too.</p>
              )}
              <p>Feedback already received through this link is kept. You can activate it again at any time.</p>
            </>
          ) : (
            <p>Customers will be able to send feedback through this link and its QR code again.</p>
          )}
          {error && <Alert>{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant={deactivating ? "danger" : "primary"} loading={submitting}>
            {deactivating ? "Deactivate link" : "Activate link"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
