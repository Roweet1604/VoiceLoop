import { Globe, LockKeyhole } from "lucide-react";

// The two choices on the public landing screen, stacked. Both cards have the
// same size, layout and a full-width solid button, so neither is presented
// as preferred; only the button colour tells them apart (accent for the
// review, high-contrast text colour for private feedback).
//
// `preview` renders the same layout without links or buttons, for Settings.
export default function LandingCards({ wording, reviewUrl, onChooseFeedback, preview = false }) {
  const reviewBody = (
    <CardBody
      Icon={Globe}
      title={wording.reviewCardTitle}
      text={wording.reviewCardText}
      action={wording.reviewCardButton}
      actionClasses="bg-accent text-onAccent"
    />
  );
  const feedbackBody = (
    <CardBody
      Icon={LockKeyhole}
      title={wording.feedbackCardTitle}
      text={wording.feedbackCardText}
      action={wording.feedbackCardButton}
      actionClasses="bg-text text-bg"
    />
  );

  if (preview) {
    return (
      <div className="grid gap-4">
        <div className={CARD_CLASSES}>{reviewBody}</div>
        <div className={CARD_CLASSES}>{feedbackBody}</div>
      </div>
    );
  }

  return (
    <ul className="grid gap-4" aria-label="Choose how to share your experience">
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

const CARD_CLASSES = "group flex w-full flex-col rounded-[20px] border border-border bg-panel p-5 text-text shadow-card sm:p-6";
const INTERACTIVE =
  "transition-colors hover:border-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function CardBody({ Icon, title, text, action, actionClasses }) {
  return (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-control bg-panel2 text-muted">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="mt-4 block text-lg font-semibold break-words text-text">{title}</span>
      <span className="mt-1 block flex-1 text-sm break-words text-muted">{text}</span>
      {/* Looks like a button; the whole card is the control. */}
      <span
        className={`mt-5 flex h-12 w-full items-center justify-center rounded-control px-4 text-[15px] font-semibold transition-opacity group-hover:opacity-90 ${actionClasses}`}
      >
        {action}
      </span>
    </>
  );
}
