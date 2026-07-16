import { Navigate, Outlet } from "react-router-dom";
import { isDispatcher } from "@/lib/roles";

// Wraps owner-only routes. A dispatcher who lands here (typed URL, stale link,
// bookmark) is bounced to her dashboard. Frontend view boundary — see lib/roles.
const AdminRoute = () =>
  isDispatcher() ? <Navigate to="/dashboard" replace /> : <Outlet />;

export default AdminRoute;
