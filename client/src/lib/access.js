// Mirrors requireActiveAccess on the server: the Super Admin, or an owner
// whose organization is currently active, may use /app. The server enforces
// this on every request; the client only uses it to pick a page.
export function canUseApp(session) {
  if (!session) return false;
  if (session.user.role === "superadmin") return true;
  return session.organization?.accessStatus === "active";
}

export function homePathFor(session) {
  return canUseApp(session) ? "/app/dashboard" : "/waiting-for-approval";
}
