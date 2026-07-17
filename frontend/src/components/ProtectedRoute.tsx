import { Navigate, Outlet } from "react-router-dom";
import { isTokenValid, clearSession } from "@/lib/auth";

const ProtectedRoute = () => {
  const token = localStorage.getItem("token");

  // Validate expiry, not just presence — otherwise a stale token renders the
  // page and then gets 401-bounced ("loads, then kicks to login"). A dead token
  // is cleared so we don't keep retrying it.
  if (!isTokenValid(token)) {
    if (token) clearSession();
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
