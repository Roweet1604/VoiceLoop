import { useEffect, useId, useRef } from "react";

// Modal built on the native <dialog> element, which provides focus trapping,
// Escape to close and an inert background. Mount it to open, unmount to close.
// While `busy`, Escape is ignored so an in-flight request isn't abandoned.
export default function Dialog({ title, description, busy = false, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-dialog border border-border bg-panel p-0 text-text shadow-card backdrop:bg-scrim"
    >
      <div className="px-6 pt-5">
        <h2 id={titleId} className="text-base font-semibold text-text">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </dialog>
  );
}

// Footer row for dialog actions; place it last inside the dialog's form.
export function DialogFooter({ children }) {
  return (
    <div className="mt-5 flex justify-end gap-2 flex-wrap rounded-b-dialog border-t border-border bg-panel2 px-6 py-3">
      {children}
    </div>
  );
}
