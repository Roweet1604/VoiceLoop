import { Link } from "react-router";
import { BarChart3, ClipboardList, FileDown, LockKeyhole, MessageSquareText, QrCode, ShieldCheck } from "lucide-react";
import PublicHeader from "../components/PublicHeader.jsx";
import PublicFooter from "../components/PublicFooter.jsx";
import { usePageMeta } from "../hooks/usePageMeta.js";

// Only describe what the product does today. Transcription is not listed:
// no speech-to-text provider is connected yet.
const STEPS = [
  {
    title: "A customer scans your QR code",
    text: "Print the code at the counter, on a table or on a receipt, or share the link online. No app and no account needed.",
  },
  {
    title: "They choose how to respond",
    text: "Leave a Google review, if you've added your review link, or send private feedback to you, written or as a short voice message.",
  },
  {
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
];

const DESCRIPTION =
  "VoiceLoop collects private customer feedback through QR codes and links, by text or voice, and helps businesses track and resolve complaints.";

export default function LandingPage() {
  usePageMeta("VoiceLoop: customer feedback by QR code, text and voice", DESCRIPTION);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader />

      <main className="flex-1">
        <section aria-labelledby="hero-heading" className="border-b border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <h1 id="hero-heading" className="max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Hear what your customers think, and act on it.
            </h1>
            <p className="mt-4 max-w-xl text-base text-ink-muted sm:text-lg">
              VoiceLoop collects customer feedback through QR codes and links, written or spoken, and gives you one place
              to read it and resolve complaints.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink shadow-xs hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Request access
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-md border border-border-strong bg-surface px-5 py-2.5 text-sm font-medium text-ink shadow-xs hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Log in
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink-muted">New accounts are reviewed and approved manually by the VoiceLoop team.</p>
          </div>
        </section>

        <section aria-labelledby="steps-heading" className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 id="steps-heading" className="text-xl font-semibold text-ink">
            How it works
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t-2 border-accent pt-4">
                <span className="text-sm font-semibold text-accentText">Step {index + 1}</span>
                <h3 className="mt-1 text-base font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="features-heading" className="border-y border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
            <h2 id="features-heading" className="text-xl font-semibold text-ink">
              What's included
            </h2>
            <ul className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {FEATURES.map(({ Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accentText">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink">{title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="access-heading" className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accentText" aria-hidden="true" />
              <div>
                <h2 id="access-heading" className="text-base font-semibold text-ink">
                  Access is approved manually
                </h2>
                <p className="mt-1 max-w-xl text-sm text-ink-muted">
                  Tell us your name, your business and your email. Once the VoiceLoop team approves your request, you can
                  log in, set up your business and print your first QR code.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-xs hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Request access
              </Link>
              <Link
                to="/login"
                className="rounded-sm text-sm font-medium text-accentText hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <div className="border-t border-border bg-surface px-4 py-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-ink-muted">VoiceLoop</p>
          <PublicFooter />
        </div>
      </div>
    </div>
  );
}
