import { Link, useLocation, useNavigate } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import PasswordField from "../components/ui/PasswordField.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useForm } from "../hooks/useForm.js";
import { validateLogin } from "../lib/validation.js";
import { homePathFor } from "../lib/access.js";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const loggedOut = location.state?.loggedOut;
  const passwordReset = location.state?.passwordReset;

  const { bind, handleSubmit, submitting, formError } = useForm({ email: "", password: "" }, validateLogin);

  const onSubmit = handleSubmit(async (values) => {
    const session = await login({ email: values.email.trim(), password: values.password });
    // Return to the page that sent them here if it's in the area this account
    // belongs to (/app or /super-admin); otherwise go to that area's home.
    const home = homePathFor(session);
    const area = `/${home.split("/")[1]}`;
    const destination = from === area || from?.startsWith(`${area}/`) ? from : home;
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
        ) : passwordReset ? (
          <Alert tone="success">Your password was changed. Log in with your new password.</Alert>
        ) : loggedOut ? (
          <Alert tone="success">You've been logged out.</Alert>
        ) : (
          from && <Alert tone="info">Log in to continue.</Alert>
        )}

        <TextField label="Email" type="email" autoComplete="email" inputMode="email" {...bind("email")} />
        <div>
          <PasswordField label="Password" autoComplete="current-password" {...bind("password")} />
          <div className="mt-1.5 text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
