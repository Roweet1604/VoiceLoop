import { Link } from "react-router";
import AuthLayout from "../components/AuthLayout.jsx";

export default function NotFoundPage() {
  return (
    <AuthLayout title="Page not found" description="The page you're looking for doesn't exist or has moved.">
      <Link to="/" className="text-sm font-medium text-accent hover:underline">
        Go to VoiceLoop
      </Link>
    </AuthLayout>
  );
}
