export const AUTH_ROUTES = Object.freeze({
  accountCreated: "/account-created",
  forgotPassword: "/forgot-password",
  signin: "/signin",
  signup: "/signup",
  updatePassword: "/update-password",
  verifyOtp: "/verify-otp"
});

export const PROTECTED_ROUTE_PREFIXES = Object.freeze([
  "/dashboard",
  "/jobs",
  "/profile",
  "/resume",
  "/run-history",
  "/applications",
  "/settings"
]);
const AUTH_CALLBACK_QUERY_KEYS = new Set([
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "id_token",
  "provider_refresh_token",
  "provider_token",
  "refresh_token",
  "token_hash",
  "token_type",
  "type"
]);

export function canonicalPath(pathname = "/") {
  if (!pathname || pathname === "/") return "/";
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized.replace(/\/+$/, "") || "/";
}

export function isAuthRoute(pathname) {
  const path = canonicalPath(pathname);
  return Object.values(AUTH_ROUTES).includes(path);
}

export function isProtectedPath(pathname) {
  const path = canonicalPath(pathname);
  return (
    path === "/" ||
    PROTECTED_ROUTE_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    )
  );
}

export function safeReturnTo(value) {
  if (!value || typeof value !== "string" || !value.startsWith("/")) {
    return null;
  }
  if (value.startsWith("//")) return null;

  try {
    const parsed = new URL(value, "https://prime-role.local");
    if (parsed.origin !== "https://prime-role.local") return null;
    if (!isProtectedPath(parsed.pathname)) return null;
    if (parsed.hash) return null;
    if (
      [...parsed.searchParams.keys()].some((key) =>
        AUTH_CALLBACK_QUERY_KEYS.has(key.toLowerCase())
      )
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function routeDecision({
  accountCreated = false,
  pendingSignup = false,
  recoveryActive = false,
  sessionValid = false,
  pathname = "/"
}) {
  const path = canonicalPath(pathname);

  if (recoveryActive) {
    return {
      action: "auth",
      path: AUTH_ROUTES.updatePassword,
      view: "update-password"
    };
  }

  if (sessionValid && isAuthRoute(path)) {
    return { action: "redirect", path: "/dashboard" };
  }

  if (path === AUTH_ROUTES.updatePassword) {
    return {
      action: "redirect",
      path: sessionValid ? "/dashboard" : AUTH_ROUTES.forgotPassword
    };
  }

  if (path === AUTH_ROUTES.accountCreated) {
    return accountCreated
      ? { action: "auth", path, view: "account-created" }
      : { action: "redirect", path: AUTH_ROUTES.signin };
  }

  if (path === AUTH_ROUTES.verifyOtp) {
    return pendingSignup
      ? { action: "auth", path, view: "verify-otp" }
      : { action: "redirect", path: AUTH_ROUTES.signup };
  }

  if (isAuthRoute(path)) {
    return sessionValid
      ? { action: "redirect", path: "/dashboard" }
      : {
          action: "auth",
          path,
          view: path.slice(1)
        };
  }

  if (sessionValid) {
    return {
      action: "workspace",
      path: isProtectedPath(path) ? path : "/dashboard"
    };
  }

  return { action: "redirect", path: AUTH_ROUTES.signin };
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function accessTokenClaims(accessToken) {
  try {
    const payload = String(accessToken || "").split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const claims = JSON.parse(atob(padded));
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

export function accessTokenAuthMethods(accessToken) {
  const claims = accessTokenClaims(accessToken);
  return Array.isArray(claims?.amr)
    ? claims.amr
        .map((entry) => entry?.method)
        .filter((method) => typeof method === "string")
    : [];
}

export function accessTokenSessionId(accessToken) {
  const sessionId = accessTokenClaims(accessToken)?.session_id;
  return typeof sessionId === "string" && sessionId ? sessionId : null;
}

export function chooseQueuedAuthEvent(current, event, session) {
  const candidate = { event, session };
  if (event === "SIGNED_OUT") return candidate;
  if (current?.event === "SIGNED_OUT") return current;
  return candidate;
}

export function signupSessionMatches(session, pendingEmail = "") {
  if (!session?.access_token || sessionUsesPassword(session)) return false;
  const sessionEmail = normalizeEmail(session.user?.email);
  const expectedEmail = normalizeEmail(pendingEmail);
  return Boolean(sessionEmail && expectedEmail && sessionEmail === expectedEmail);
}

export function recoverySessionMatches(session, expectedSessionId = "") {
  if (!session?.access_token || sessionUsesPassword(session)) return false;
  const sessionId = accessTokenSessionId(session.access_token);
  return Boolean(sessionId && expectedSessionId && sessionId === expectedSessionId);
}

export function isTemporaryEmailSession(session) {
  if (!session?.access_token) return false;
  return !sessionUsesPassword(session);
}

export function sessionUsesPassword(session) {
  try {
    return accessTokenAuthMethods(session?.access_token).includes("password");
  } catch {
    return false;
  }
}

export function suppressAuthEventImmediately({
  event,
  suppressSignedOutUntil = 0
}) {
  return event === "SIGNED_OUT" && Date.now() < suppressSignedOutUntil;
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordValidationMessage(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must contain at least 8 characters.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter.";
  }
  if (!/\d/.test(password)) {
    return "Password must include a number.";
  }
  return null;
}

export function validateSignUp(values) {
  if (!String(values.firstName || "").trim()) {
    return { field: "signup-first-name", message: "Enter your first name." };
  }
  if (!String(values.lastName || "").trim()) {
    return { field: "signup-last-name", message: "Enter your last name." };
  }
  if (!isValidEmail(values.email)) {
    return {
      field: "signup-email",
      message: "Enter a valid email address."
    };
  }
  const passwordMessage = passwordValidationMessage(values.password);
  if (passwordMessage) {
    return { field: "signup-password", message: passwordMessage };
  }
  if (values.password !== values.confirmPassword) {
    return {
      field: "signup-confirm-password",
      message: "Passwords do not match."
    };
  }
  return null;
}

export function validatePasswordPair(password, confirmPassword) {
  const passwordMessage = passwordValidationMessage(password);
  if (passwordMessage) return passwordMessage;
  if (password !== confirmPassword) return "Passwords do not match.";
  return null;
}

export function otpDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6).split("");
}

export function otpCooldownSeconds(availableAt, now = Date.now()) {
  const deadline = Number(availableAt);
  const currentTime = Number(now);
  if (!Number.isFinite(deadline) || !Number.isFinite(currentTime)) return 0;
  return Math.max(0, Math.ceil((deadline - currentTime) / 1000));
}

export function isOtpCodeError(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "otp_expired" ||
    code === "invalid_otp" ||
    message.includes("token has expired") ||
    message.includes("invalid token") ||
    message.includes("invalid otp") ||
    message.includes("expired")
  );
}

export function friendlyAuthError(error, context = "auth") {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status || 0);

  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    status === 429 ||
    message.includes("rate limit")
  ) {
    return "Too many requests. Please wait a minute and try again.";
  }

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "Incorrect email or password.";
  }

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "Your email is not verified. Finish email verification before signing in.";
  }

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered")
  ) {
    return "If this email can be registered, verification instructions will be sent. You can also sign in or reset your password.";
  }

  if (isOtpCodeError(error)) {
    return "The verification code is incorrect or expired. Request a new code and try again.";
  }

  if (code === "weak_password" || message.includes("weak password")) {
    return "Choose a stronger password that meets the requirements.";
  }

  if (code === "same_password" || message.includes("same password")) {
    return "Your new password must be different from your current password.";
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  ) {
    return "Unable to reach the authentication service. Check your connection and try again.";
  }

  if (context === "signin") return "Unable to sign in. Please try again.";
  if (context === "signup") {
    return "Unable to create the account or send verification. Please try again.";
  }
  if (context === "verify") {
    return "Verification failed. Check the code and try again.";
  }
  if (context === "reset") {
    return "Unable to complete the password reset. Please try again.";
  }
  return "Authentication could not be completed. Please try again.";
}
