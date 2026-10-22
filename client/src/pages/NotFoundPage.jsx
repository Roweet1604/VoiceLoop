import { Link } from "react-router";
import { MapPinOff } from "lucide-react";
import AuthLayout from "../components/AuthLayout.jsx";

export default function NotFoundPage() {
  return (
    <AuthLayout
      icon={MapPinOff}
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
    >
      <Link
        to="/"
        className="rounded-sm text-sm font-semibold text-accentText hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Go to VoiceLoop
      </Link>
    </AuthLayout>
  );
}
