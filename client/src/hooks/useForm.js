import { useState } from "react";

// Form state for simple forms (auth, business setup and settings).
//
// Validation runs on submit. After the first submit attempt, fields are
// re-validated as the user types so errors clear as soon as they're fixed.
// Server errors are mapped back onto fields where possible (the server's
// `details` use the same field names), otherwise shown as a form-level error.
export function useForm(initialValues, validate) {
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);

  function bind(name) {
    return {
      name,
      value: values[name],
      error: fieldErrors[name],
      disabled: submitting,
      onChange: (e) => {
        const next = { ...values, [name]: e.target.value };
        setValues(next);
        if (attempted) {
          setFieldErrors(validate(next));
        } else if (fieldErrors[name]) {
          setFieldErrors(({ [name]: _cleared, ...rest }) => rest);
        }
      },
    };
  }

  function handleSubmit(onValid) {
    return async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      setAttempted(true);
      setFormError(null);

      const errors = validate(values);
      setFieldErrors(errors);
      const firstInvalid = Object.keys(errors)[0];
      if (firstInvalid) {
        form.elements.namedItem(firstInvalid)?.focus();
        return;
      }

      setSubmitting(true);
      try {
        await onValid(values);
      } catch (err) {
        if (err.details) {
          setFieldErrors(err.details);
          setFormError("Please correct the highlighted fields.");
        } else if (err.code === "EMAIL_IN_USE") {
          setFieldErrors({ email: err.message });
        } else {
          setFormError(err.message);
        }
      } finally {
        setSubmitting(false);
      }
    };
  }

  // Replace the values (e.g. with what the server saved) and clear errors.
  function reset(nextValues) {
    setValues(nextValues);
    setFieldErrors({});
    setFormError(null);
    setAttempted(false);
  }

  return { values, bind, handleSubmit, submitting, formError, reset };
}
