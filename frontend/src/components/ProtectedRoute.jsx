import { Navigate } from "react-router-dom";
import { isLoggedIn, getRole } from "../utils/auth";

export default function ProtectedRoute({ children, roles }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(getRole())) {
    return <Navigate to="/" replace />;
  }

  return children;
}
