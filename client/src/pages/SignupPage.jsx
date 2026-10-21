import { Link, useNavigate } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import PasswordField from "../components/ui/PasswordField.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useForm } from "../hooks/useForm.js";
import { validateSignup, PASSWORD_MIN_LENGTH } from "../lib/validation.js";
import { homePathFor } from "../lib/access.js";
import { usePageMeta } from "../hooks/usePageMeta.js";

export default function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  usePageMeta(
    "Request access | VoiceLoop",
    "Request a VoiceLoop account to collect private text and voice feedback from your customers. New accounts are approved manually."
  );
  const { bind, handleSubmit, submitting, formError } = useForm(
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
      title="Request access"
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
          {submitting ? "Sending request…" : "Request access"}
        </Button>

        <p className="text-xs text-ink-muted">
          New accounts are reviewed by the VoiceLoop team before the dashboard becomes available.
        </p>
        <p className="text-xs text-ink-muted">
          By requesting access you agree to the{" "}
          <Link to="/terms" className="font-medium text-accent hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="font-medium text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}
