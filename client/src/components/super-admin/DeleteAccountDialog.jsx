import { useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import Dialog, { DialogFooter } from "../ui/Dialog.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import { inputClasses } from "../ui/TextField.jsx";
import { api } from "../../lib/api.js";

// The name the server expects: the business name, or the organization name
// if no business has been set up (see server/src/services/accountDeletion.js).
export const confirmationName = (account) => account.businessName ?? account.name;

export default function DeleteAccountDialog({ account, onClose, onDeleted }) {
  const expected = confirmationName(account);
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const inputId = useId();
  const matches = typed.trim() === expected;

  async function onSubmit(e) {
    e.preventDefault();
    if (!matches) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/super-admin/accounts/${account.id}/delete`, { method: "POST", body: { confirmName: typed.trim() } });
      onDeleted(account);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog title="Delete account permanently" busy={submitting} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="space-y-4 px-6 pt-3 text-sm">
          <div>
            <p className="text-ink">This permanently deletes:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted">
              <li>
                The account <strong className="font-medium text-ink">{account.name}</strong> and its access history
              </li>
              <li>
                {account.owner ? (
                  <>
                    The owner's login, <strong className="font-medium text-ink">{account.owner.email}</strong>
                  </>
                ) : (
                  "All user logins in this account"
                )}
              </li>
              {account.businessName && (
                <li>
                  The business <strong className="font-medium text-ink">{account.businessName}</strong> and its settings
                </li>
              )}
              <li>All feedback links and QR codes; printed codes will show “not available”</li>
              <li>All feedback received, including internal notes</li>
              <li>Earlier audit entries about this account (one record of the deletion is kept)</li>
            </ul>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-danger">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>This can't be undone.</p>
          </div>

          <div>
            <label htmlFor={inputId} className="block text-ink">
              Type <strong className="font-semibold break-words">{expected}</strong> to confirm
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className={`${inputClasses} mt-1.5 border-border-strong`}
            />
          </div>

          {error && <Alert>{error}</Alert>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!matches} loading={submitting}>
            {submitting ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
