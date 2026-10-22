import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowUp, ChevronDown, TriangleAlert } from "lucide-react";
import PublicHeader from "./PublicHeader.jsx";
import PublicFooter from "./PublicFooter.jsx";
import ThemeToggle from "./ui/ThemeToggle.jsx";
import { usePageMeta } from "../hooks/usePageMeta.js";

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// "Who we are" -> "who-we-are", for section ids.
const slugify = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Scrolls a heading into view (smoothly unless the user prefers reduced
// motion) and moves keyboard focus to it.
function goTo(element) {
  element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  element.focus({ preventScroll: true });
}

// Frame for the Privacy Policy and Terms pages: a header block (back link,
// title, date, draft notice), then the document in a card with an "On this
// page" list of its sections. From 1100px the list is a sticky column on the
// left; below that it is a collapsible card above the document. The list is
// read from the rendered <h2> headings, so it always matches the text.
export default function LegalLayout({ title, description, children }) {
  usePageMeta(`${title} | VoiceLoop`, description);
  const documentRef = useRef(null);
  const titleRef = useRef(null);
  const [sections, setSections] = useState([]);
  const [active, setActive] = useState(null);
  const pinnedRef = useRef(null); // the heading last chosen in the list

  useEffect(() => {
    const headings = [...documentRef.current.querySelectorAll("h2[id]")];
    setSections(headings.map((h) => ({ id: h.id, text: h.textContent })));
    setActive(headings[0]?.id ?? null);

    // The observer fires whenever a heading crosses the line at 30% of the
    // window height. The active section is then the last heading above that
    // line (the first section before any is). A heading chosen in the list
    // stays active until the user scrolls by hand, even when the end of the
    // page stops it reaching the line.
    const update = () => {
      if (pinnedRef.current) return;
      const line = window.innerHeight * 0.3;
      const above = headings.filter((h) => h.getBoundingClientRect().top <= line).at(-1);
      setActive((above ?? headings[0])?.id ?? null);
    };
    const observer = new IntersectionObserver(update, { rootMargin: "0px 0px -70% 0px" });
    headings.forEach((h) => observer.observe(h));
    // The user scrolling by hand ends the pin (the smooth scroll to the
    // chosen heading doesn't, so the highlight doesn't flicker on the way).
    const unpin = () => {
      if (!pinnedRef.current) return;
      pinnedRef.current = null;
      update();
    };
    const userScrollEvents = ["wheel", "touchmove", "keydown"];
    userScrollEvents.forEach((type) => window.addEventListener(type, unpin, { passive: true }));
    return () => {
      observer.disconnect();
      userScrollEvents.forEach((type) => window.removeEventListener(type, unpin));
    };
  }, []);

  function onTocClick(e, id) {
    e.preventDefault();
    const heading = document.getElementById(id);
    if (!heading) return;
    pinnedRef.current = id;
    setActive(id);
    // Close the collapsible list first: it sits above the document, so
    // closing it after the scroll started would shift the target.
    const details = e.currentTarget.closest("details");
    if (details) {
      details.removeAttribute("open");
      requestAnimationFrame(() => goTo(heading));
    } else {
      goTo(heading);
    }
  }

  const tocLinks = (
    <ol className="space-y-0.5">
      {sections.map(({ id, text }) => {
        const current = id === active;
        return (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(e) => onTocClick(e, id)}
              aria-current={current ? "location" : undefined}
              className={`block border-l-2 py-1.5 pr-2 pl-3 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                current ? "border-accent font-semibold text-accentText" : "border-border text-muted hover:border-faint hover:text-text"
              }`}
            >
              {text}
            </a>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <PublicHeader />
      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-[760px] min-[1100px]:max-w-[1200px]">
          <header className="space-y-6">
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>
            <div>
              <h1
                ref={titleRef}
                tabIndex={-1}
                className="scroll-mt-6 text-[30px] leading-tight font-bold tracking-tight text-text outline-none sm:text-[38px]"
              >
                {title}
              </h1>
              <p className="mt-2 text-sm text-muted">
                Last updated: <Placeholder>DATE</Placeholder>
              </p>
            </div>
            <div
              role="note"
              className="flex items-start gap-2 rounded-control border border-warn/30 bg-warnSoft px-3 py-2 text-sm text-warn"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                <span className="font-semibold">Draft for review.</span> This text has not been reviewed by a lawyer yet.
                Items in square brackets, such as <Placeholder>CONTACT EMAIL</Placeholder>, still need to be filled in.
              </p>
            </div>
          </header>

          <div className="mt-8 min-[1100px]:grid min-[1100px]:grid-cols-[260px_minmax(0,760px)] min-[1100px]:gap-12">
            <nav
              aria-label="On this page"
              className="hidden self-start min-[1100px]:sticky min-[1100px]:top-[88px] min-[1100px]:block min-[1100px]:max-h-[calc(100dvh-112px)] min-[1100px]:overflow-y-auto"
            >
              <p className="mb-3 text-[11px] font-semibold tracking-wider text-muted uppercase">On this page</p>
              {tocLinks}
            </nav>

            <div className="min-w-0 space-y-6">
              {/* Below 1100px the list is a collapsed card above the document. */}
              <details className="group rounded-[16px] border border-border bg-panel min-[1100px]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[16px] px-5 py-4 text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                  On this page
                  <ChevronDown
                    className="h-4 w-4 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <nav aria-label="On this page" className="px-5 pb-4">
                  {tocLinks}
                </nav>
              </details>

              <article
                ref={documentRef}
                className="rounded-[16px] border border-border bg-panel p-5 [overflow-wrap:anywhere] sm:p-8 lg:p-10"
              >
                {children}
                <div className="mt-10 border-t border-border pt-6">
                  <a
                    href="#top"
                    onClick={(e) => {
                      e.preventDefault();
                      pinnedRef.current = sections[0]?.id ?? null;
                      setActive(pinnedRef.current);
                      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
                      titleRef.current?.focus({ preventScroll: true });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-accentText hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    Back to top
                  </a>
                </div>
              </article>
            </div>
          </div>
        </div>
      </main>
      <div className="border-t border-border px-4 py-6">
        <div className="flex flex-col items-center gap-4">
          <PublicFooter />
          <ThemeToggle showLabel className="min-[400px]:hidden" />
        </div>
      </div>
    </div>
  );
}

// One section. The heading gets an id (for the "On this page" list) and can
// take focus when a list link moves to it. A faint divider separates it from
// the section before.
export function Section({ title, children }) {
  return (
    <section className="[&:not(:first-child)]:mt-5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&:not(:first-child)]:pt-5">
      <h2
        id={slugify(title)}
        tabIndex={-1}
        className="scroll-mt-6 text-xl font-semibold tracking-tight text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3.5 text-[15px] leading-[1.7] text-text sm:text-base">{children}</div>
    </section>
  );
}

export function List({ children }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-faint">{children}</ul>;
}

// Text still to be filled in before publishing, shown in brackets.
export function Placeholder({ children }) {
  return <mark className="rounded-sm bg-warnSoft px-1 font-semibold text-warn">[{children}]</mark>;
}
