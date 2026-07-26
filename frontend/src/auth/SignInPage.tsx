import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

export function SignInPage() {
  const { configured, sendEmailSignIn, verifyEmailCode } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendEmail = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await sendEmailSignIn(email.trim());
      setEmailSent(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not send the email."
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await verifyEmailCode(email.trim(), code.trim());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not verify the code."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>Prime Role</strong>
            <span>Career workspace</span>
          </div>
        </div>
        <div className="auth-promise">
          <span className="section-kicker">YOUR PRIVATE JOB WORKSPACE</span>
          <h1>Find the role. Shape the resume. Make your move.</h1>
          <p>
            Keep your base resume local, review matching jobs and create a
            tailored copy only when you choose.
          </p>
        </div>
        <div className="auth-trust">
          <span>✓ Email-only access</span>
          <span>✓ Resume files stay on this computer</span>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <span className="section-kicker">WELCOME TO PRIME ROLE</span>
          <h2>{emailSent ? "Check your email" : "Sign in to continue"}</h2>
          <p className="auth-intro">
            {emailSent
              ? `We sent a secure sign-in email to ${email}.`
              : "Enter your email address. No password or mobile number is required."}
          </p>

          {!configured ? (
            <div className="auth-error" role="alert">
              Supabase is not configured. Add VITE_SUPABASE_URL and
              VITE_SUPABASE_PUBLISHABLE_KEY to the repository .env file, then
              restart the frontend.
            </div>
          ) : !emailSent ? (
            <form onSubmit={(event) => void sendEmail(event)}>
              <label className="auth-field">
                Email address
                <input
                  autoComplete="email"
                  autoFocus
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </label>
              {error && (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              )}
              <button className="auth-submit" disabled={busy} type="submit">
                {busy ? "Sending…" : "Email me a sign-in link"}
                <span>→</span>
              </button>
            </form>
          ) : (
            <>
              <div className="email-sent-note">
                <span>✉</span>
                Open the link in Supabase&apos;s email to finish signing in.
                This page will continue automatically.
              </div>

              <div className="auth-divider">
                <span>or enter a code if your email contains one</span>
              </div>

              <form onSubmit={(event) => void verifyCode(event)}>
                <label className="auth-field">
                  Six-digit email code
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    required
                    value={code}
                  />
                </label>
                {error && (
                  <div className="auth-error" role="alert">
                    {error}
                  </div>
                )}
                <button
                  className="auth-submit"
                  disabled={busy || code.length !== 6}
                  type="submit"
                >
                  {busy ? "Verifying…" : "Verify email code"}
                  <span>→</span>
                </button>
              </form>

              <button
                className="auth-link-button"
                onClick={() => {
                  setEmailSent(false);
                  setCode("");
                  setError("");
                }}
                type="button"
              >
                Use a different email
              </button>
            </>
          )}

          <p className="auth-legal">
            By continuing, you agree to use Prime Role only for truthful job
            applications and resume tailoring.
          </p>
        </div>
      </section>
    </main>
  );
}
