import { useNavigate } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";
import TextField from "../components/ui/TextField.jsx";
import Button from "../components/ui/Button.jsx";
import Alert from "../components/ui/Alert.jsx";
import { useBusiness, useHandleAccessError } from "../context/BusinessContext.jsx";
import { useForm } from "../hooks/useForm.js";
import { useLogout } from "../hooks/useLogout.js";
import { api } from "../lib/api.js";
import { validateBusiness, BUSINESS_LIMITS } from "../lib/validation.js";

// First step for a newly approved owner. Only the essentials; everything
// else can be filled in later under Settings.
export default function SetupPage() {
  const { setBusiness } = useBusiness();
  const handleAccessError = useHandleAccessError();
  const navigate = useNavigate();
  const { logout, loggingOut, error: logoutError } = useLogout();
  const { bind, handleSubmit, submitting, formError } = useForm(
    { name: "", locationName: "", googleReviewUrl: "" },
    validateBusiness
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { business } = await api("/api/business", {
        method: "POST",
        body: {
          name: values.name.trim(),
          locationName: values.locationName.trim(),
          googleReviewUrl: values.googleReviewUrl.trim(),
        },
      });
      setBusiness(business);
      navigate("/app/dashboard", { replace: true, state: { justCreated: true } });
    } catch (err) {
      handleAccessError(err);
      throw err;
    }
  });

  return (
    <AuthLayout
      title="Set up your business"
      description="This is the name customers see when they leave feedback."
      footer={
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="font-medium text-ink-muted hover:text-ink disabled:opacity-50"
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {(formError || logoutError) && <Alert>{formError || logoutError}</Alert>}

        <TextField
          label="Business name"
          autoComplete="organization"
          maxLength={BUSINESS_LIMITS.name}
          {...bind("name")}
        />
        <TextField
          label="Location (optional)"
          hint="Helps customers recognise which branch they're reviewing, e.g. “Indiranagar”."
          maxLength={BUSINESS_LIMITS.locationName}
          {...bind("locationName")}
        />
        <TextField
          label="Google review link (optional)"
          type="url"
          inputMode="url"
          placeholder="https://g.page/r/…/review"
          hint="Offered to every customer as a separate option. Must start with https://. You can add it later in Settings."
          {...bind("googleReviewUrl")}
        />

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? "Creating…" : "Create business"}
        </Button>
        <p className="text-xs text-ink-muted">
          Your public feedback link is created from the business name and won't change later, even if you rename it.
        </p>
      </form>
    </AuthLayout>
  );
}
