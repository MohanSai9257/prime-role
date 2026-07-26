import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SignInPage } from "./auth/SignInPage";
import "./styles.css";

function AuthenticatedApp() {
  const { configured, loading, session } = useAuth();

  if (loading) {
    return (
      <main className="auth-loading">
        <div className="brand-mark">P</div>
        <span>Opening Prime Role…</span>
      </main>
    );
  }

  if (!configured || !session) {
    return <SignInPage />;
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  </StrictMode>
);
