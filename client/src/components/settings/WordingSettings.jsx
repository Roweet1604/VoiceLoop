import { useState } from "react";
import { Info } from "lucide-react";
import Card from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";
import Alert from "../ui/Alert.jsx";
import TextField from "../ui/TextField.jsx";
import LandingCards from "../LandingCards.jsx";
import { useBusiness, useHandleAccessError } from "../../context/BusinessContext.jsx";
import { useForm } from "../../hooks/useForm.js";
import { api } from "../../lib/api.js";
import { validateBusiness, WORDING_LIMITS } from "../../lib/validation.js";
import { DEFAULT_TEXT, FIXED_WORDING, TEXT_FIELDS, resolveWording, isHttpsUrl } from "../../lib/landingWording.js";

const toValues = (business) => Object.fromEntries(TEXT_FIELDS.map((f) => [f, business[f] ?? ""]));
const EMPTY = Object.fromEntries(TEXT_FIELDS.map((f) => [f, ""]));

const FIELDS = [
  ["reviewCardText", `"${FIXED_WORDING.reviewCardTitle}" card text`],
  ["feedbackCardText", `"${FIXED_WORDING.feedbackCardTitle}" card text`],
];

// "Customer page wording": edits the text of the two landing-screen cards.
// Titles and buttons are fixed. Empty fields fall back to the defaults, which
// are shown as placeholders.
export default function WordingSettings() {
  const { business, setBusiness } = useBusiness();
  const handleAccessError = useHandleAccessError();
  const { values, bind, handleSubmit, submitting, formError, reset } = useForm(toValues(business), validateBusiness);
  const [saved, setSaved] = useState(false);

  const changes = Object.fromEntries(
    TEXT_FIELDS.filter((f) => values[f].trim() !== (business[f] ?? "")).map((f) => [f, values[f].trim()])
  );
  const dirty = Object.keys(changes).length > 0;
  const allDefault = TEXT_FIELDS.every((f) => !values[f].trim());

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
    <Card className="@container p-5">
      <h2 className="text-sm font-semibold text-text">Customer page wording</h2>
      <p className="mt-1 text-sm text-muted">
        When a Google review link is set, customers first choose between two cards. You can change the text on each
        card; titles and buttons are fixed. Leave a field empty to use the default shown in grey.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-control bg-panel2 px-3 py-2.5 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          The review card text should not be addressed only to happy customers, and must not offer rewards for a
          review. Google's review policies don't allow either.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-6">
        {formError && <Alert>{formError}</Alert>}
        {saved && <Alert tone="success">Wording saved.</Alert>}

        <fieldset className="grid gap-4 @xl:grid-cols-2" disabled={submitting}>
          <legend className="sr-only">Card text</legend>
          {FIELDS.map(([name, label]) => (
            <TextField
              key={name}
              label={label}
              multiline
              rows={3}
              maxLength={WORDING_LIMITS[name]}
              placeholder={DEFAULT_TEXT[name]}
              hint={`${values[name].trim().length} / ${WORDING_LIMITS[name]}`}
              {...field(name)}
            />
          ))}
        </fieldset>

        <figure>
          <figcaption className="text-xs font-semibold text-muted">Preview</figcaption>
          {/* Framed at phone width, which is how most customers see it. */}
          <div className="mx-auto mt-2 w-full max-w-[380px] rounded-[28px] border-[6px] border-border bg-bg p-4 shadow-card">
            <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-border" aria-hidden="true" />
            <LandingCards wording={resolveWording(values)} preview />
          </div>
          {!isHttpsUrl(business.googleReviewUrl) && (
            <p className="mt-3 text-center text-xs text-muted">
              No Google review link is saved yet, so customers currently go straight to the feedback form.
            </p>
          )}
        </figure>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          {dirty && !submitting && <span className="text-xs text-muted">Unsaved changes</span>}
          <Button
            variant="secondary"
            disabled={allDefault || submitting}
            onClick={() => {
              reset(EMPTY);
              setSaved(false);
            }}
          >
            Reset to defaults
          </Button>
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
            {submitting ? "Saving…" : "Save wording"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
