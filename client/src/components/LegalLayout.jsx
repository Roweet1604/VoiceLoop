import { TriangleAlert } from "lucide-react";
import PublicHeader from "./PublicHeader.jsx";
import PublicFooter from "./PublicFooter.jsx";
import { usePageMeta } from "../hooks/usePageMeta.js";

// Frame for the Privacy Policy and Terms pages: a draft notice, then the
// text in a readable column.
export default function LegalLayout({ title, description, children }) {
  usePageMeta(`${title} | VoiceLoop`, description);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader />
      <main className="flex-1 px-4 py-10 sm:px-6">
        <article className="mx-auto max-w-2xl">
          <div
            role="note"
            className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-warning"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">Draft for review.</span> This text has not been reviewed by a lawyer yet.
              Items in square brackets, such as <Placeholder>CONTACT EMAIL</Placeholder>, still need to be filled in.
            </p>
          </div>

          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Last updated: <Placeholder>DATE</Placeholder>
          </p>
          <div className="mt-8 space-y-8">{children}</div>
        </article>
      </main>
      <div className="border-t border-border bg-surface px-4 py-6">
        <PublicFooter />
      </div>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-6 text-ink">{children}</div>
    </section>
  );
}

export function List({ children }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-subtle">{children}</ul>;
}

// Text still to be filled in before publishing, shown in brackets.
export function Placeholder({ children }) {
  return <mark className="rounded-sm bg-warning-soft px-1 font-medium text-warning">[{children}]</mark>;
}
