import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import PasswordField from "../components/ui/PasswordField.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useForm } from "../hooks/useForm.js";
import { api } from "../lib/api.js";
import { validateResetPassword, PASSWORD_MIN_LENGTH } from "../lib/validation.js";
import { usePageMeta } from "../hooks/usePageMeta.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// /reset-password?token=... from the emailed link.
export default function ResetPasswordPage() {
  usePageMeta("Choose a new password | VoiceLoop", "Choose a new password for your VoiceLoop account.");
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Keep the token in memory and take it out of the address bar, so it isn't
  // left in the browser history or shared by copying the URL.
  const [token] = useState(() => params.get("token") ?? "");
  const [linkProblem, setLinkProblem] = useState(TOKEN_PATTERN.test(token) ? null : "incomplete");

  useEffect(() => {
    if (params.has("token")) setParams({}, { replace: true });
  }, [params, setParams]);

  const { bind, handleSubmit, submitting, formError } = useForm({ newPassword: "" }, validateResetPassword);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api("/api/auth/reset-password", { method: "POST", body: { token, newPassword: values.newPassword } });
    } catch (err) {
      if (err.code === "INVALID_RESET_TOKEN") {
        setLinkProblem("invalid");
        return;
      }
      if (err.status === 429) throw new Error("Too many attempts. Please wait a few minutes, then try again.");
      throw err;
    }
    // Every session ended with the reset, this one included: forget it here
    // too, so the login page doesn't send a stale session onwards.
    await refresh().catch(() => {});
    navigate("/login", { replace: true, state: { passwordReset: true } });
  });

  const requestNew = (
    <Link to="/forgot-password" className="font-medium text-accentText hover:underline">
      Request a new link
    </Link>
  );

  if (linkProblem) {
    return (
      <AuthLayout
        title={linkProblem === "invalid" ? "This link has expired" : "This link is incomplete"}
        footer={
          <Link to="/login" className="font-medium text-accentText hover:underline">
            Back to log in
          </Link>
        }
      >
        <Alert>
          {linkProblem === "invalid"
            ? "This reset link has expired or has already been used. Links work once, for 30 minutes."
            : "This reset link is missing part of its address. Open the link from your email again, or copy all of it into the address bar."}
        </Alert>
        <p className="mt-4 text-sm text-text">{requestNew}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" description="After this, you'll be logged out everywhere and can log in with the new password.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <PasswordField
          label="New password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          autoFocus
          {...bind("newPassword")}
        />
        <Button type="submit" loading={submitting} className="h-12 w-full text-sm">
          {submitting ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
