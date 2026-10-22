import { Link } from "react-router";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Clock,
  FileDown,
  Inbox,
  LockKeyhole,
  MessageSquareText,
  QrCode,
  ScanLine,
  ShieldCheck,
  SquareMousePointer,
} from "lucide-react";
import PublicHeader from "../components/PublicHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";
import LandingCards from "../components/LandingCards.jsx";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";
import { resolveWording } from "../lib/landingWording.js";
import { usePageMeta } from "../hooks/usePageMeta.js";

// Only describe what the product does today. Transcription is not listed:
// no speech-to-text provider is connected yet.
const STEPS = [
  {
    Icon: ScanLine,
    title: "A customer scans your QR code",
    text: "Print the code at the counter, on a table or on a receipt, or share the link online. No app and no account needed.",
  },
  {
    Icon: SquareMousePointer,
    title: "They choose how to respond",
    text: "Leave a Google review, if you've added your review link, or send private feedback to you, written or as a short voice message.",
  },
  {
    Icon: Inbox,
    title: "You read it and resolve it",
    text: "Feedback arrives in your inbox. Mark it reviewed, track complaints until they're resolved, and keep notes for your team.",
  },
];

const FEATURES = [
  {
    Icon: QrCode,
    title: "QR codes and multiple links",
    text: "Create a named link for each place you collect feedback, such as Reception or Table 4. Download its QR code, pause it any time, and see how much feedback each one brings in.",
  },
  {
    Icon: MessageSquareText,
    title: "Text and voice feedback",
    text: "Customers write a message or record up to two minutes in the browser. Name and email are optional, so feedback is anonymous by default.",
  },
  {
    Icon: ClipboardList,
    title: "Complaint statuses and internal notes",
    text: "Move complaints from open to in progress to resolved, reopen them if needed, and add a resolution summary. Notes stay internal and are never shown to customers.",
  },
  {
    Icon: Inbox,
    title: "Inbox with filters",
    text: "Search messages and transcripts, and filter by category, review status, complaint status, type, source and date.",
  },
  {
    Icon: BarChart3,
    title: "Analytics",
    text: "Feedback volume over time, categories, sources, complaint resolution and frequently repeated words, all calculated from the feedback you've actually received.",
  },
  {
    Icon: FileDown,
    title: "CSV export",
    text: "Download your feedback, filtered the way you need it, as a spreadsheet-friendly CSV file.",
  },
  {
    Icon: LockKeyhole,
    title: "Private audio storage",
    text: "Voice recordings are stored privately, never at a public address, and play only inside your signed-in dashboard.",
  },
  {
    Icon: Clock,
    title: "Deleted automatically after 45 days",
    text: "Feedback and recordings are removed automatically after 45 days, so you only keep what you need. Export a CSV first if you want a copy.",
  },
];

// The real customer-facing cards with their default wording, as a preview.
const PREVIEW_WORDING = resolveWording({});

const PRIMARY_LINK =
  "inline-flex h-12 items-center justify-center gap-2 rounded-control bg-accent px-6 text-sm font-semibold text-onAccent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TEXT_LINK =
  "inline-flex items-center gap-1 rounded-sm text-sm font-semibold text-accentText hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const DESCRIPTION =
  "VoiceLoop collects private customer feedback through QR codes and links, by text or voice, and helps businesses track and resolve complaints.";

export default function LandingPage() {
  usePageMeta("VoiceLoop: customer feedback by QR code, text and voice", DESCRIPTION);

  // Sections alternate bg / panel with a 1px border between them; cards
  // inside a section take the other surface so they stay distinct.
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <PublicHeader />

      <main className="flex-1">
        <section aria-labelledby="hero-heading">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-12 lg:py-14">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs font-semibold text-muted">
                <QrCode className="h-3.5 w-3.5 text-accentText" aria-hidden="true" />
                QR codes · text · voice
              </p>
              <h1
                id="hero-heading"
                className="mt-4 max-w-[40rem] text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] font-bold tracking-tight text-text"
              >
                Hear what your customers think, and act on it.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                VoiceLoop collects customer feedback through QR codes and links, written or spoken, and gives you one place
                to read it and resolve complaints.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link to="/signup" className={PRIMARY_LINK}>
                  Request access
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link to="/login" className={TEXT_LINK}>
                  Log in
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">New accounts are reviewed and approved manually by the VoiceLoop team.</p>
            </div>

            {/* What a customer sees after scanning: the real cards, default text. */}
            <figure className="mx-auto w-full max-w-[340px]">
              <div className="rounded-[30px] border-[6px] border-border bg-panel p-3.5 shadow-card">
                <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-border" aria-hidden="true" />
                <div aria-hidden="true" inert>
                  <LandingCards wording={PREVIEW_WORDING} preview compact />
                </div>
              </div>
              <figcaption className="mt-3 text-center text-xs text-muted">
                What a customer sees after scanning your QR code
              </figcaption>
            </figure>
          </div>
        </section>

        <section aria-labelledby="steps-heading" className="border-t border-border bg-panel">
          <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
            <h2 id="steps-heading" className="text-2xl font-semibold tracking-tight text-text">
              How it works
            </h2>
            <ol className="mt-6 grid gap-5 md:grid-cols-3 lg:mt-7">
              {STEPS.map(({ Icon, title, text }, index) => (
                <li key={title} className="rounded-[18px] border border-border bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-control bg-accentSoft text-accentText">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-accentText">Step {index + 1}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-text">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="border-t border-border">
          <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
            <h2 id="features-heading" className="text-2xl font-semibold tracking-tight text-text">
              What's included
            </h2>
            <ul className="mt-6 grid gap-5 min-[700px]:grid-cols-2 min-[1200px]:grid-cols-4 lg:mt-7">
              {FEATURES.map(({ Icon, title, text }) => (
                <li key={title} className="rounded-[18px] border border-border bg-panel p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-control bg-accentSoft text-accentText">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-text">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="access-heading" className="border-t border-border bg-panel">
          <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-12 lg:py-16">
            <div className="flex flex-col gap-6 rounded-[18px] border border-border bg-bg p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accentSoft text-accentText">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="access-heading" className="text-lg font-semibold text-text">
                    Access is approved manually
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                    Tell us your name, your business and your email. Once the VoiceLoop team approves your request, you
                    can log in, set up your business and print your first QR code.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
                <Link to="/signup" className={PRIMARY_LINK}>
                  Request access
                </Link>
                <Link to="/login" className={TEXT_LINK}>
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="border-t border-border px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted">VoiceLoop</p>
          <PublicFooter />
          <ThemeToggle showLabel className="min-[400px]:hidden" />
        </div>
      </div>
    </div>
  );
}
