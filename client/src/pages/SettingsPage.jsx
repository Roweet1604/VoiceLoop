import { useState } from "react";
import Card from "../components/ui/Card.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import TextField from "../components/ui/TextField.jsx";
import PublicLink from "../components/PublicLink.jsx";
import WordingSettings from "../components/settings/WordingSettings.jsx";
import { publicFeedbackUrl } from "../lib/publicUrl.js";
import { useBusiness, useHandleAccessError } from "../context/BusinessContext.jsx";
import { useForm } from "../hooks/useForm.js";
import { api } from "../lib/api.js";
import { validateBusiness, BUSINESS_LIMITS } from "../lib/validation.js";

const FIELDS = ["name", "locationName", "welcomeMessage", "googleReviewUrl"];

const toValues = (business) => Object.fromEntries(FIELDS.map((f) => [f, business[f] ?? ""]));

export default function SettingsPage() {
  const { business, setBusiness } = useBusiness();
  const handleAccessError = useHandleAccessError();
  const { values, bind, handleSubmit, submitting, formError, reset } = useForm(toValues(business), validateBusiness);
  const [saved, setSaved] = useState(false);

  // Only send fields that actually changed.
  const changes = Object.fromEntries(
    FIELDS.filter((f) => values[f].trim() !== (business[f] ?? "")).map((f) => [f, values[f].trim()])
  );
  const dirty = Object.keys(changes).length > 0;

  const onSubmit = handleSubmit(async () => {
    setSaved(false);
    try {
      const { business: updated } = await api("/api/business", { method: "PATCH", body: changes });
      setBusiness(updated);
      reset(toValues(updated));
      setSaved(true);
    } catch (err) {
      handleAccessError(err);
      throw err;
    }
  });

  // Hide the "saved" message as soon as the form is edited again.
  const field = (name) => {
    const props = bind(name);
    return {
      ...props,
      onChange: (e) => {
        setSaved(false);
        props.onChange(e);
      },
    };
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-ink-muted">What customers see on your feedback page.</p>

      <Card className="mt-6">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError && <Alert>{formError}</Alert>}
          {saved && <Alert tone="success">Settings saved.</Alert>}

          <TextField label="Business name" maxLength={BUSINESS_LIMITS.name} {...field("name")} />
          <TextField
            label="Location (optional)"
            hint="e.g. a branch or neighbourhood."
            maxLength={BUSINESS_LIMITS.locationName}
            {...field("locationName")}
          />
          <TextField
            label="Welcome message (optional)"
            multiline
            rows={3}
            maxLength={BUSINESS_LIMITS.welcomeMessage}
            hint={`Shown above the feedback form. ${values.welcomeMessage.trim().length}/${BUSINESS_LIMITS.welcomeMessage}`}
            {...field("welcomeMessage")}
          />
          <TextField
            label="Google review link (optional)"
            type="url"
            inputMode="url"
            placeholder="https://g.page/r/…/review"
            hint="Offered to every customer as a separate option, whatever their feedback. Must start with https://"
            {...field("googleReviewUrl")}
          />

          <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
            {dirty && !submitting && <span className="text-xs text-ink-muted">Unsaved changes</span>}
            <Button
              variant="secondary"
              disabled={!dirty || submitting}
              onClick={() => {
                reset(toValues(business));
                setSaved(false);
              }}
            >
              Discard
            </Button>
            <Button type="submit" loading={submitting} disabled={!dirty}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>

      <WordingSettings />

      <Card className="mt-4">
        <h2 className="text-sm font-semibold text-ink">Public feedback link</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Created when you set up your business. It doesn't change when you rename it, so printed links keep working.
        </p>
        <div className="mt-4">
          <PublicLink url={publicFeedbackUrl(business.publicSlug)} />
        </div>
      </Card>
    </div>
  );
}
