import { useState } from "react";
import { Link } from "react-router";
import { MailCheck } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useForm } from "../hooks/useForm.js";
import { api } from "../lib/api.js";
import { validateForgotPassword } from "../lib/validation.js";
import { usePageMeta } from "../hooks/usePageMeta.js";

// Asks for a reset link. The confirmation is the same whether or not the
// email has an account, as is the server's answer.
export default function ForgotPasswordPage() {
  usePageMeta("Reset your password | VoiceLoop", "Get an email with a link to choose a new VoiceLoop password.");
  const [sentTo, setSentTo] = useState(null);
  const { bind, handleSubmit, submitting, formError, reset } = useForm({ email: "" }, validateForgotPassword);

  const onSubmit = handleSubmit(async (values) => {
    const email = values.email.trim();
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: { email } });
    } catch (err) {
      if (err.status === 429) {
        throw new Error("Too many requests from this network. Please wait a while, then try again.");
      }
      throw err;
    }
    setSentTo(email);
  });

  const backToLogin = (
    <Link to="/login" className="font-medium text-accent hover:underline">
      Back to log in
    </Link>
  );

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={backToLogin}>
        <div role="status">
          <MailCheck className="h-6 w-6 text-success" aria-hidden="true" />
          <p className="mt-3 text-sm text-ink">
            If an account exists for <span className="font-medium break-all">{sentTo}</span>, we sent a link to reset
            the password.
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            The link works once, for 30 minutes. If nothing arrives in a few minutes, check your spam folder.
          </p>
        </div>
        <Button
          variant="secondary"
          className="mt-5 w-full"
          onClick={() => {
            reset({ email: "" });
            setSentTo(null);
          }}
        >
          Use a different email
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter the email you log in with and we'll send you a link to choose a new password."
      footer={backToLogin}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" {...bind("email")} />
        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthLayout>
  );
}
