import { Link } from "react-router";
import LegalLayout, { Section, List, Placeholder } from "../components/LegalLayout.jsx";

// Draft. Describes only what the product does today; keep it in step with
// the code (for example, if transcription or a new data field is added).
// "45 days" is the default RETENTION_DAYS (server/src/services/retention.js);
// change it here too if the server is configured differently.
export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="What VoiceLoop collects from customers and businesses, who can see it, how voice recordings are stored and how data is deleted."
    >
      <Section title="Who we are">
        <p>
          VoiceLoop is operated by <Placeholder>COMPANY NAME</Placeholder> ("we"). VoiceLoop lets businesses collect
          feedback from their customers through QR codes and links. You can contact us at{" "}
          <Placeholder>CONTACT EMAIL</Placeholder>.
        </p>
        <p>This policy covers two groups of people:</p>
        <List>
          <li>
            <strong className="font-semibold">Customers</strong> who leave feedback for a business on a VoiceLoop feedback
            page.
          </li>
          <li>
            <strong className="font-semibold">Business users</strong> who have a VoiceLoop account and read that feedback.
          </li>
        </List>
      </Section>

      <Section title="What we collect when you leave feedback">
        <p>You don't need an account to leave feedback. When you send feedback, we store:</p>
        <List>
          <li>the category you chose, such as complaint, suggestion or compliment;</li>
          <li>your written message, if you wrote one;</li>
          <li>
            your voice recording, if you recorded one, together with its length, file format and size;
          </li>
          <li>your name and email address, only if you chose to enter them (both are optional);</li>
          <li>which of the business's feedback links or QR codes you used;</li>
          <li>the date and time you sent it.</li>
        </List>
        <p>
          To limit abuse, our server briefly uses your IP address to count how many messages are sent from it in a short
          period. The IP address is not saved with your feedback. Our hosting providers may keep their own standard
          technical logs.
        </p>
      </Section>

      <Section title="Who can see your feedback">
        <List>
          <li>
            Only the business whose feedback page you used can see your feedback, through its signed-in VoiceLoop account.
            Other businesses on VoiceLoop cannot see it.
          </li>
          <li>Your feedback is not shown publicly and is never published as a review.</li>
          <li>
            The business may add internal notes and status updates to your feedback. These are for the business only.
          </li>
          <li>
            VoiceLoop's administrator screens do not show feedback content. People who operate the service may have
            technical access to the database and storage when that is needed for maintenance, security or legal reasons.
          </li>
        </List>
        <p>
          If a business has added a Google review link, the feedback page also offers it. If you choose it, you leave
          VoiceLoop and go to Google, where Google's own terms and privacy policy apply. VoiceLoop does not post anything
          to Google for you.
        </p>
      </Section>

      <Section title="Voice recordings">
        <p>
          Recordings are stored in private storage, not at a public web address. They can only be played by the business
          that received them, through its signed-in dashboard.
        </p>
        <p>
          VoiceLoop does not currently transcribe recordings (turn them into text), and does not analyse them with
          artificial intelligence. If this changes, we will update this policy before it happens.
        </p>
      </Section>

      <Section title="What we collect from business users">
        <List>
          <li>your name, email address and business name, given when you request access;</li>
          <li>
            your password, stored only as a secure one-way hash. Nobody, including us, can view your password; if you
            forget it, you reset it by email;
          </li>
          <li>your business's settings, such as its name, welcome message, logo address and Google review link;</li>
          <li>your feedback links, and the statuses and notes you add to feedback;</li>
          <li>
            a record of important actions, such as who changed an account's access or a business's settings, and when;
          </li>
          <li>your account's access status and its history (pending, active, suspended, expired or rejected).</li>
        </List>
        <p>
          Analytics in the dashboard are calculated from this feedback, including counts of frequently repeated words in
          written messages. They are shown only to that business.
        </p>
        <p>
          Password reset emails are sent through an email delivery provider, <Placeholder>EMAIL PROVIDER</Placeholder>,
          which receives your email address and the message.
        </p>
      </Section>

      <Section title="Cookies and third parties">
        <p>
          When a business user logs in, we set one cookie to keep them logged in. It cannot be read by scripts on the
          page. Customers leaving feedback are not given a cookie. We do not use advertising or analytics trackers.
        </p>
        <p>
          Our pages load the Inter font from Google Fonts, so your browser connects to Google's servers when it opens a
          VoiceLoop page.
        </p>
      </Section>

      <Section title="How long data is kept">
        <p>
          Feedback is deleted automatically 45 days after it was sent, together with its recording, notes and status
          history, whether or not the business has dealt with it. Businesses can export a copy as a CSV file before then;
          that copy is their responsibility.
        </p>
        <List>
          <li>Feedback can be deleted sooner, as described below.</li>
          <li>
            When a business account is deleted, all of its data is deleted with it: its businesses, links, feedback, notes
            and voice recordings.
          </li>
          <li>Password reset links stop working after 30 minutes and are removed automatically soon after.</li>
          <li>
            Backup copies may remain for a limited time after deletion: <Placeholder>BACKUP RETENTION</Placeholder>.
          </li>
        </List>
        <p>
          You can ask for your data to be deleted. If you left feedback, contact the business you sent it to, or write to
          us at <Placeholder>CONTACT EMAIL</Placeholder> and tell us which business it was for. Business users can ask us
          to delete their account at the same address.
        </p>
      </Section>

      <Section title="Businesses are responsible for their own use">
        <p>
          Each business decides why it collects feedback and what it does with it. The business is responsible for telling
          its customers how it uses their feedback, for answering their requests, and for following the laws that apply
          to it. See our <Link to="/terms" className="font-medium text-accentText hover:underline">Terms</Link>.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We take reasonable steps to protect data, such as hashing passwords, keeping recordings in private storage and
          checking on every request that a user may access the data asked for. No system is perfectly secure, and we
          cannot guarantee that data will never be lost or accessed without permission.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We will update this page when VoiceLoop changes how it handles data, and change the date at the top. Questions
          about this policy: <Placeholder>CONTACT EMAIL</Placeholder>.
        </p>
      </Section>
    </LegalLayout>
  );
}
