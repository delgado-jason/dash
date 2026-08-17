import { Navigate, Outlet } from "react-router-dom";
import { hasCompleteSession, clearSession } from "@/lib/auth";

const ProtectedRoute = () => {
  // Validate the WHOLE session — token expiry AND identity (user_id + role).
  // A dead token renders the page and then 401-bounces; a half-session (valid
  // token, missing identity keys) is worse: role defaults to admin and the UI
  // renders a chimera. Either way: clear it and start clean at login.
  if (!hasCompleteSession()) {
    clearSession();
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
