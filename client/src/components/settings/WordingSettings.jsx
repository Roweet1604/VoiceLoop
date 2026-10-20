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
import { DEFAULT_WORDING, WORDING_FIELDS, resolveWording, isHttpsUrl } from "../../lib/landingWording.js";

const toValues = (business) => Object.fromEntries(WORDING_FIELDS.map((f) => [f, business[f] ?? ""]));
const EMPTY = Object.fromEntries(WORDING_FIELDS.map((f) => [f, ""]));

const CARDS = [
  {
    heading: "Google review card",
    fields: [
      ["reviewCardTitle", "Title"],
      ["reviewCardText", "Text", true],
      ["reviewCardButton", "Button label"],
    ],
  },
  {
    heading: "Private feedback card",
    fields: [
      ["feedbackCardTitle", "Title"],
      ["feedbackCardText", "Text", true],
      ["feedbackCardButton", "Button label"],
    ],
  },
];

// "Customer page wording": edits the two landing-screen cards. Empty fields
// fall back to the neutral defaults, which are shown as placeholders.
export default function WordingSettings() {
  const { business, setBusiness } = useBusiness();
  const handleAccessError = useHandleAccessError();
  const { values, bind, handleSubmit, submitting, formError, reset } = useForm(toValues(business), validateBusiness);
  const [saved, setSaved] = useState(false);

  const changes = Object.fromEntries(
    WORDING_FIELDS.filter((f) => values[f].trim() !== (business[f] ?? "")).map((f) => [f, values[f].trim()])
  );
  const dirty = Object.keys(changes).length > 0;
  const allDefault = WORDING_FIELDS.every((f) => !values[f].trim());

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
    <Card className="mt-4">
      <h2 className="text-sm font-semibold text-ink">Customer page wording</h2>
      <p className="mt-1 text-sm text-ink-muted">
        When a Google review link is set, customers first choose between two equal options. Leave a field empty to
        use the default shown in grey.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-md bg-subtle px-3 py-2.5 text-xs text-ink-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <p>
          Keep the review card neutral. Both cards are shown to every customer, whatever their experience, so don't
          address only happy customers or offer anything in return for a review. Google's review policies don't allow
          either.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-6">
        {formError && <Alert>{formError}</Alert>}
        {saved && <Alert tone="success">Wording saved.</Alert>}

        <div className="grid gap-6 md:grid-cols-2">
          {CARDS.map((card) => (
            <fieldset key={card.heading} className="space-y-3" disabled={submitting}>
              <legend className="text-sm font-medium text-ink">{card.heading}</legend>
              {card.fields.map(([name, label, multiline]) => (
                <TextField
                  key={name}
                  label={label}
                  multiline={multiline}
                  rows={multiline ? 3 : undefined}
                  maxLength={WORDING_LIMITS[name]}
                  placeholder={DEFAULT_WORDING[name]}
                  hint={`${values[name].trim().length} / ${WORDING_LIMITS[name]}`}
                  {...field(name)}
                />
              ))}
            </fieldset>
          ))}
        </div>

        <figure>
          <figcaption className="text-xs font-medium text-ink-muted">Preview</figcaption>
          <div className="mt-2 rounded-lg border border-border bg-canvas p-4">
            <LandingCards wording={resolveWording(values)} preview />
          </div>
          {!isHttpsUrl(business.googleReviewUrl) && (
            <p className="mt-2 text-xs text-ink-muted">
              No Google review link is saved yet, so customers currently go straight to the feedback form.
            </p>
          )}
        </figure>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          {dirty && !submitting && <span className="text-xs text-ink-muted">Unsaved changes</span>}
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
