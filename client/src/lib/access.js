// Which area of the app a session belongs in. The server enforces access on
// every request; the client only uses this to pick a page.
//
//   Super Admin             -> /super-admin
//   owner, active access    -> /app/dashboard
//   owner, anything else    -> /waiting-for-approval

export function isSuperAdmin(session) {
  return session?.user.role === "superadmin";
}

// The business dashboard (/app/*) is for owners whose access is active.
export function canUseApp(session) {
  return !isSuperAdmin(session) && session?.organization?.accessStatus === "active";
}

export function homePathFor(session) {
  if (isSuperAdmin(session)) return "/super-admin";
  return canUseApp(session) ? "/app/dashboard" : "/waiting-for-approval";
}
