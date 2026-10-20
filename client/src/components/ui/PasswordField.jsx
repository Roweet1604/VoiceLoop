import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import TextField from "./TextField.jsx";

export default function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="rounded-sm p-1.5 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      }
    />
  );
}
