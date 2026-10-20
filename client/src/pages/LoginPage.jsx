import { Link, useLocation, useNavigate } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import PasswordField from "../components/ui/PasswordField.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useAuthForm } from "../hooks/useAuthForm.js";
import { validateLogin } from "../lib/validation.js";
import { canUseApp, homePathFor } from "../lib/access.js";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const loggedOut = location.state?.loggedOut;

  const { bind, handleSubmit, submitting, formError } = useAuthForm({ email: "", password: "" }, validateLogin);

  const onSubmit = handleSubmit(async (values) => {
    const session = await login({ email: values.email.trim(), password: values.password });
    // Return to the page that sent them here, but only if they're allowed in.
    const destination = canUseApp(session) && from?.startsWith("/app") ? from : homePathFor(session);
    navigate(destination, { replace: true });
  });

  return (
    <AuthLayout
      title="Log in"
      description="Welcome back to VoiceLoop."
      footer={
        <>
          New to VoiceLoop?{" "}
          <Link to="/signup" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError ? (
          <Alert>{formError}</Alert>
        ) : loggedOut ? (
          <Alert tone="success">You've been logged out.</Alert>
        ) : (
          from && <Alert tone="info">Log in to continue.</Alert>
        )}

        <TextField label="Email" type="email" autoComplete="email" inputMode="email" {...bind("email")} />
        <PasswordField label="Password" autoComplete="current-password" {...bind("password")} />

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
