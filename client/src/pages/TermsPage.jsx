import { Link } from "react-router";
import LegalLayout, { Section, List, Placeholder } from "../components/LegalLayout.jsx";

// Draft. Describes only how the product works today. "45 days" is the default
// RETENTION_DAYS (server/src/services/retention.js).
export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      description="The terms for using VoiceLoop: manual account approval, business responsibilities, acceptable use and suspension."
    >
      <Section title="About these terms">
        <p>
          VoiceLoop is operated by <Placeholder>COMPANY NAME</Placeholder> ("we"). These terms apply to businesses that
          use VoiceLoop to collect feedback, and to customers who leave feedback on a VoiceLoop feedback page. By using
          VoiceLoop you agree to them. Our <Link to="/privacy" className="font-medium text-accentText hover:underline">Privacy Policy</Link>{" "}
          explains how data is handled.
        </p>
      </Section>

      <Section title="Accounts and access">
        <List>
          <li>
            Anyone can request an account. Every request is reviewed manually by the VoiceLoop team, and we may approve or
            reject it.
          </li>
          <li>
            Access may be approved for a set period or without an end date. When a period ends, the account can no longer
            use the dashboard, and its feedback pages stop accepting feedback, until access is extended.
          </li>
          <li>
            We may suspend an account, for example if these terms are broken or the account puts other users or the
            service at risk. A suspended account cannot use the dashboard, and its feedback pages stop accepting feedback.
            We may later reactivate it.
          </li>
          <li>
            You are responsible for keeping your login details safe and for what happens under your account. If you
            forget your password, reset it by email from the login page.
          </li>
        </List>
      </Section>

      <Section title="Businesses are responsible for their use">
        <p>A business that uses VoiceLoop is responsible for:</p>
        <List>
          <li>how it collects and uses its customers' feedback, and for telling customers about it;</li>
          <li>following the laws that apply to it, including privacy and consumer laws;</li>
          <li>
            the content it adds, such as its business name, welcome message, logo and Google review link;
          </li>
          <li>
            following Google's rules for reviews. Customers must be free to leave a review whatever their experience was;
          </li>
          <li>responding to its customers, including requests to delete their feedback.</li>
        </List>
      </Section>

      <Section title="Leaving feedback">
        <p>
          Feedback goes privately to the business whose page you used. The business decides whether and how to respond.
          Please don't include other people's personal details, passwords, payment card numbers or other sensitive
          information in your message or recording.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>You must not use VoiceLoop to:</p>
        <List>
          <li>send or collect content that is unlawful, threatening, harassing, hateful or obscene;</li>
          <li>send spam, or submit feedback automatically or in bulk;</li>
          <li>pretend to be another person or business;</li>
          <li>upload malware or files that are not genuine voice recordings;</li>
          <li>try to access another account's data, or get around access checks or request limits;</li>
          <li>overload, disrupt, scan or scrape the service;</li>
          <li>collect sensitive information from customers that the business does not need.</li>
        </List>
      </Section>

      <Section title="Your content">
        <p>
          A business's feedback, links and settings belong to that business. We store and process them only to run
          VoiceLoop for that business. When an account is deleted, its data is deleted as described in the{" "}
          <Link to="/privacy" className="font-medium text-accentText hover:underline">Privacy Policy</Link>.
        </p>
        <p>
          Feedback and its recordings, notes and status history are deleted automatically 45 days after they were sent,
          including complaints that are still open. Export a CSV file if you need to keep a copy for longer.
        </p>
      </Section>

      <Section title="The service">
        <p>
          VoiceLoop is an early-stage product. It is provided "as is" and "as available". We don't promise that it will
          always be available, free of errors or suitable for a particular purpose, and its features may change. Keep your
          own copies of anything important, for example with the CSV export.
        </p>
        <p>
          Limitation of liability: <Placeholder>LIMITATION OF LIABILITY</Placeholder>.
        </p>
      </Section>

      <Section title="Ending use">
        <p>
          A business can ask us to delete its account at <Placeholder>CONTACT EMAIL</Placeholder>. We may close or delete
          an account that breaks these terms. Deleting an account permanently removes its data.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by <Placeholder>GOVERNING LAW</Placeholder>.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update these terms and will change the date at the top when we do. Questions:{" "}
          <Placeholder>CONTACT EMAIL</Placeholder>.
        </p>
      </Section>
    </LegalLayout>
  );
}
