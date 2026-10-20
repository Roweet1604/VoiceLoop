import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext.jsx";

export function useLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setLoggingOut(true);
    setError(null);
    try {
      await logout();
      navigate("/login", { replace: true, state: { loggedOut: true } });
    } catch (err) {
      setError(err.message);
      setLoggingOut(false);
    }
  }

  return { logout: run, loggingOut, error };
}
