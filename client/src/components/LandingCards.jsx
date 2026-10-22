import { Globe, LockKeyhole } from "lucide-react";

// The two equal-weight choices on the public landing screen. Both cards use
// identical styling, size and emphasis; neither is presented as preferred.
//
// `preview` renders the same layout without links or buttons, for Settings.
export default function LandingCards({ wording, reviewUrl, onChooseFeedback, preview = false }) {
  const reviewBody = (
    <CardBody Icon={Globe} title={wording.reviewCardTitle} text={wording.reviewCardText} action={wording.reviewCardButton} />
  );
  const feedbackBody = (
    <CardBody
      Icon={LockKeyhole}
      title={wording.feedbackCardTitle}
      text={wording.feedbackCardText}
      action={wording.feedbackCardButton}
    />
  );

  // Sized by its own width, so inside the phone-width preview frame it
  // stacks as on a phone even on a wide screen.
  if (preview) {
    return (
      <div className="@container">
        <div className="grid gap-3 @lg:grid-cols-2">
          <div className={CARD_CLASSES}>{reviewBody}</div>
          <div className={CARD_CLASSES}>{feedbackBody}</div>
        </div>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Choose how to share your experience">
      <li className="flex">
        <a href={reviewUrl} target="_blank" rel="noopener noreferrer" className={`${CARD_CLASSES} ${INTERACTIVE}`}>
          {reviewBody}
          <span className="sr-only">(opens Google in a new tab)</span>
        </a>
      </li>
      <li className="flex">
        <button type="button" onClick={onChooseFeedback} className={`${CARD_CLASSES} ${INTERACTIVE} text-left`}>
          {feedbackBody}
        </button>
      </li>
    </ul>
  );
}

const CARD_CLASSES = "flex w-full flex-col rounded-lg border border-border bg-panel p-5 text-text shadow-xs";
const INTERACTIVE =
  "transition-colors hover:border-border-strong hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function CardBody({ Icon, title, text, action }) {
  return (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel2 text-muted">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="mt-3 block text-base font-semibold break-words text-text">{title}</span>
      <span className="mt-1 block flex-1 text-sm break-words text-muted">{text}</span>
      {/* Looks like a button; the whole card is the control. */}
      <span className="mt-4 inline-flex items-center justify-center rounded-md border border-border-strong bg-panel px-4 py-2 text-sm font-medium text-text shadow-xs">
        {action}
      </span>
    </>
  );
}
