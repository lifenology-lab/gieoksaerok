import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/authContextValue";

export function ProtectedRoute({ children }) {
  const { hasPassedLoginPage, isAuthenticated, isCheckingSession } = useAuth();
  const location = useLocation();

  if (isCheckingSession) {
    return (
      <main className="auth-page auth-page--loading">
        <p>로그인 상태를 확인하고 있어요.</p>
      </main>
    );
  }

  if (!isAuthenticated || !hasPassedLoginPage) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return children;
}
