import { Link, useNavigate } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import PasswordField from "../components/ui/PasswordField.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useAuthForm } from "../hooks/useAuthForm.js";
import { validateSignup, PASSWORD_MIN_LENGTH } from "../lib/validation.js";
import { homePathFor } from "../lib/access.js";

export default function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { bind, handleSubmit, submitting, formError } = useAuthForm(
    { name: "", organizationName: "", email: "", password: "" },
    validateSignup
  );

  const onSubmit = handleSubmit(async (values) => {
    const session = await register({
      name: values.name.trim(),
      organizationName: values.organizationName.trim(),
      email: values.email.trim(),
      password: values.password,
    });
    navigate(homePathFor(session), { replace: true, state: { justRegistered: true } });
  });

  return (
    <AuthLayout
      title="Create your account"
      description="Collect private text and voice feedback from your customers."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}

        <TextField label="Your name" autoComplete="name" maxLength={100} {...bind("name")} />
        <TextField label="Business name" autoComplete="organization" maxLength={120} {...bind("organizationName")} />
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" {...bind("email")} />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          {...bind("password")}
        />

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-xs text-ink-muted">
          New accounts are reviewed by the VoiceLoop team before the dashboard becomes available.
        </p>
      </form>
    </AuthLayout>
  );
}
