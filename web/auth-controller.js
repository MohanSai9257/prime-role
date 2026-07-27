import {
  AUTH_ROUTES,
  accessTokenSessionId,
  canonicalPath,
  chooseQueuedAuthEvent,
  friendlyAuthError,
  isAuthRoute,
  isProtectedPath,
  isTemporaryEmailSession,
  isValidEmail,
  normalizeEmail,
  otpDigits,
  recoverySessionMatches,
  routeDecision,
  safeReturnTo,
  sessionUsesPassword,
  signupSessionMatches,
  suppressAuthEventImmediately,
  validatePasswordPair,
  validateSignUp
} from "./auth-helpers.js";

const PENDING_SIGNUP_KEY = "prime-role:pending-signup:v2";
const ACCOUNT_CREATED_KEY = "prime-role:account-created:v2";
const RECOVERY_KEY = "prime-role:password-recovery:v2";
const RESET_COOLDOWN_KEY = "prime-role:reset-cooldown:v2";
const PENDING_SIGNUP_TTL_MS = 60 * 60 * 1000;
const ACCOUNT_CREATED_TTL_MS = 15 * 60 * 1000;
const RECOVERY_TTL_MS = 30 * 60 * 1000;
const RESET_COOLDOWN_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const memoryRecords = new Map();

const VIEW_TITLES = Object.freeze({
  "account-created": "Account created · Prime Role",
  "forgot-password": "Reset password · Prime Role",
  signin: "Sign in · Prime Role",
  signup: "Create account · Prime Role",
  "update-password": "Choose a new password · Prime Role",
  "verify-otp": "Verify email · Prime Role"
});

function readRecord(key, ttl) {
  let record = memoryRecords.get(key) || null;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) record = JSON.parse(stored);
  } catch {
    // The in-memory record keeps this tab usable when storage is blocked.
  }

  if (
    !record ||
    typeof record !== "object" ||
    !Number.isFinite(record.createdAt) ||
    Date.now() - record.createdAt > ttl
  ) {
    removeRecord(key);
    return null;
  }
  return record;
}

function writeRecord(key, record) {
  memoryRecords.set(key, { ...record });
  try {
    sessionStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Continue with the tab-local in-memory record.
  }
}

function removeRecord(key) {
  memoryRecords.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore unavailable session storage.
  }
}

function pendingSignup() {
  return readRecord(PENDING_SIGNUP_KEY, PENDING_SIGNUP_TTL_MS);
}

function accountCreated() {
  return readRecord(ACCOUNT_CREATED_KEY, ACCOUNT_CREATED_TTL_MS);
}

function recoveryRecord() {
  return readRecord(RECOVERY_KEY, RECOVERY_TTL_MS);
}

function resetCooldown() {
  return readRecord(RESET_COOLDOWN_KEY, RESET_COOLDOWN_TTL_MS);
}

function showMessage(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function clearMessage(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function setBusy(button, busy, busyText, idleText) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  const label = button.querySelector("span");
  if (label) label.textContent = busy ? busyText : idleText;
}

function focusFirstControl(view) {
  window.requestAnimationFrame(() => {
    const control = view.querySelector(
      "input:not([disabled]), button.auth-submit:not([disabled])"
    );
    control?.focus({ preventScroll: true });
  });
}

function currentOtp(inputs) {
  return inputs.map((input) => input.value).join("");
}

export function recordAuthStateChange(state, event, session) {
  const generation = ++state.authEventGeneration;
  state.lastAuthEvent = { event, generation, session };
  const queued = !state.initialized || state.initializing;
  if (queued) {
    const chosenEvent = chooseQueuedAuthEvent(
      state.queuedAuthEvent,
      event,
      session
    );
    state.queuedAuthEvent =
      chosenEvent === state.queuedAuthEvent
        ? state.queuedAuthEvent
        : { ...chosenEvent, generation };
  }
  return { generation, queued };
}

export function createAuthController({
  elements,
  initialCallback = {},
  onAuthenticated,
  onSignedOut,
  showToast,
  supabaseClient,
  supabasePublishableKey,
  supabaseUrl
}) {
  const authViews = [...document.querySelectorAll("[data-auth-view]")];
  const otpInputsList = [
    ...document.querySelectorAll("[data-otp-index]")
  ];
  const state = {
    activeView: "",
    authEventGeneration: 0,
    initialized: false,
    initialCallback: {
      error: String(initialCallback.error || ""),
      errorCode: String(initialCallback.errorCode || ""),
      hasCredentials: Boolean(initialCallback.hasCredentials),
      type: String(initialCallback.type || "").toLowerCase()
    },
    initializationRetryCount: 0,
    initializing: true,
    lastAuthEvent: null,
    processingAccountConfirmation: false,
    queuedAuthEvent: null,
    rejectCallbackSessions: Boolean(initialCallback.hasCredentials),
    recoveryActive: false,
    recoverySession: null,
    resetTimer: null,
    resendTimer: null,
    session: null,
    sessionInvalidationEpoch: 0,
    signinNotice: "",
    suppressSignedOutUntil: 0,
    transition: null
  };

  function setAuthView(viewName) {
    elements["auth-loading"].classList.add("hidden");
    elements["workspace-screen"].classList.add("hidden");
    elements["auth-screen"].classList.remove("hidden");

    let activeView = null;
    authViews.forEach((view) => {
      const active = view.dataset.authView === viewName;
      view.classList.toggle("hidden", !active);
      if (active) activeView = view;
    });

    if (state.activeView !== viewName) {
      document.querySelectorAll("[data-toggle-password]").forEach((button) => {
        const input = elements[button.dataset.togglePassword];
        const inputView = input?.closest("[data-auth-view]")?.dataset.authView;
        if (input && inputView !== viewName) input.value = "";
        if (input) input.type = "password";
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", "Show password");
      });
      if (viewName !== "verify-otp") {
        otpInputsList.forEach((input) => {
          input.value = "";
        });
      }
      authViews
        .filter((view) => view.dataset.authView !== viewName)
        .forEach((view) => {
          view
            .querySelectorAll(".auth-error, .auth-notice")
            .forEach(clearMessage);
        });
      state.activeView = viewName;
    }

    document.title = VIEW_TITLES[viewName] || "Prime Role";

    if (viewName === "signin") {
      if (state.signinNotice) {
        showMessage(elements["signin-notice"], state.signinNotice);
        state.signinNotice = "";
      } else {
        clearMessage(elements["signin-notice"]);
      }
      const pending = pendingSignup();
      if (pending?.email && !elements["signin-email"].value) {
        elements["signin-email"].value = pending.email;
      }
    }

    if (viewName === "signup") {
      const pending = pendingSignup();
      if (pending?.email && !elements["signup-email"].value) {
        elements["signup-email"].value = pending.email;
      }
    }

    if (viewName === "verify-otp") {
      const pending = pendingSignup();
      elements["verify-email-text"].textContent = pending?.email
        ? `If this address can be registered, a 6-digit verification code was sent to ${pending.email}`
        : "If this address can be registered, a verification code was sent.";
      updateResendButton();
      window.clearInterval(state.resendTimer);
      state.resendTimer = window.setInterval(updateResendButton, 1000);
    } else {
      window.clearInterval(state.resendTimer);
      state.resendTimer = null;
    }

    if (viewName === "forgot-password") {
      updateResetButton();
      window.clearInterval(state.resetTimer);
      state.resetTimer = window.setInterval(updateResetButton, 1000);
    } else {
      window.clearInterval(state.resetTimer);
      state.resetTimer = null;
    }

    if (activeView) focusFirstControl(activeView);
  }

  function updateResendButton() {
    const pending = pendingSignup();
    const remaining = Math.max(
      0,
      Math.ceil(((pending?.resendAt || 0) - Date.now()) / 1000)
    );
    elements["resend-otp"].disabled = remaining > 0;
    elements["resend-otp"].textContent =
      remaining > 0 ? `Resend in ${remaining}s` : "Resend OTP";
  }

  function updateResetButton() {
    const cooldown = resetCooldown();
    const remaining = Math.max(
      0,
      Math.ceil(((cooldown?.availableAt || 0) - Date.now()) / 1000)
    );
    elements["forgot-password-submit"].disabled = remaining > 0;
    const label = elements["forgot-password-submit"].querySelector("span");
    if (label) {
      label.textContent =
        remaining > 0 ? `Try again in ${remaining}s` : "Send reset link";
    }
  }

  async function validateSession(session, { requirePassword = true } = {}) {
    if (!session?.access_token) return null;
    const {
      data: { user },
      error
    } = await supabaseClient.auth.getUser(session.access_token);
    if (error || !user) return null;
    if (requirePassword && !sessionUsesPassword(session)) return null;
    return { ...session, user };
  }

  function sessionsMatch(left, right) {
    const leftSessionId = accessTokenSessionId(left?.access_token);
    const rightSessionId = accessTokenSessionId(right?.access_token);
    return Boolean(
      leftSessionId &&
        rightSessionId &&
        leftSessionId === rightSessionId &&
        left?.user?.id === right?.user?.id
    );
  }

  async function currentSessionMatches(expectedSession) {
    const {
      data: { session },
      error
    } = await supabaseClient.auth.getSession();
    return !error && sessionsMatch(session, expectedSession);
  }

  function adoptMatchingSignInGeneration(expectedSession, generation) {
    const lastEvent = state.lastAuthEvent;
    if (
      generation !== state.authEventGeneration &&
      lastEvent?.generation === state.authEventGeneration &&
      lastEvent.event === "SIGNED_IN" &&
      sessionsMatch(lastEvent.session, expectedSession)
    ) {
      return lastEvent.generation;
    }
    return generation;
  }

  async function discardExpectedSession(expectedSession) {
    const cleanupGeneration = state.authEventGeneration;
    if (
      (await currentSessionMatches(expectedSession)) &&
      cleanupGeneration === state.authEventGeneration
    ) {
      await clearSupabaseSession();
    }
  }

  async function clearSupabaseSession() {
    state.sessionInvalidationEpoch += 1;
    state.session = null;
    state.recoverySession = null;
    onSignedOut();
    state.suppressSignedOutUntil = Date.now() + 5_000;
    const { error: signOutError } = await supabaseClient.auth.signOut({
      scope: "local"
    });
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();
    const cleared = !session;

    if (!cleared) {
      state.suppressSignedOutUntil = 0;
      return {
        cleared: false,
        error:
          signOutError ||
          sessionError ||
          new Error("The local authentication session could not be cleared.")
      };
    }

    return { cleared: true, error: signOutError || sessionError || null };
  }

  function callbackPathWithoutSecrets() {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hasSensitiveParameters =
      [
        "access_token",
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
      ].some((key) => hash.has(key)) ||
      [
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
      ].some((key) => search.has(key));
    if (!hasSensitiveParameters) return;
    const returnTo = safeReturnTo(search.get("returnTo"));
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${
        returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
      }`
    );
  }

  function clearInitialCallback() {
    state.initialCallback = {
      error: "",
      errorCode: "",
      hasCredentials: false,
      type: ""
    };
  }

  function hasTrustedCallbackType(...types) {
    return (
      state.initialCallback.hasCredentials &&
      types.includes(state.initialCallback.type)
    );
  }

  async function navigate(path, { replace = false } = {}) {
    const target = path.startsWith("/") ? path : `/${path}`;
    window.history[replace ? "replaceState" : "pushState"]({}, "", target);
    await renderCurrentRoute();
  }

  async function renderCurrentRoute() {
    if (!state.initialized) return;

    const path = canonicalPath(window.location.pathname);
    const pending = pendingSignup();
    const created = accountCreated();
    const recovery = recoveryRecord();

    if (!state.session && !isAuthRoute(path) && !state.recoveryActive) {
      const returnTo =
        isProtectedPath(path) && path !== "/"
          ? `?returnTo=${encodeURIComponent(
              `${path}${window.location.search}${window.location.hash}`
            )}`
          : "";
      await navigate(`${AUTH_ROUTES.signin}${returnTo}`, { replace: true });
      return;
    }

    const decision = routeDecision({
      accountCreated: Boolean(created),
      pathname: path,
      pendingSignup: Boolean(pending?.email),
      recoveryActive: Boolean(
        state.recoveryActive && state.recoverySession && recovery
      ),
      sessionValid: Boolean(state.session)
    });

    if (decision.action === "redirect") {
      await navigate(decision.path, { replace: true });
      return;
    }

    if (decision.action === "workspace") {
      if (decision.path !== path) {
        await navigate(decision.path, { replace: true });
        return;
      }
      elements["auth-loading"].classList.add("hidden");
      elements["auth-screen"].classList.add("hidden");
      elements["workspace-screen"].classList.remove("hidden");
      await onAuthenticated(state.session);
      return;
    }

    if (decision.path !== path) {
      await navigate(decision.path, { replace: true });
      return;
    }

    setAuthView(decision.view);
  }

  async function beginRecovery(session) {
    const sessionId = accessTokenSessionId(session?.access_token);
    if (!isTemporaryEmailSession(session) || !sessionId) {
      state.recoveryActive = false;
      removeRecord(RECOVERY_KEY);
      state.signinNotice =
        "This password-reset link is invalid or expired. Request a new one.";
      await navigate(AUTH_ROUTES.forgotPassword, { replace: true });
      showMessage(
        elements["forgot-password-error"],
        "This password-reset link is invalid or expired. Request a new one."
      );
      return;
    }

    state.recoveryActive = true;
    state.rejectCallbackSessions = false;
    clearInitialCallback();
    state.recoverySession = session;
    state.session = null;
    onSignedOut();
    const existingRecovery = recoveryRecord();
    writeRecord(RECOVERY_KEY, {
      createdAt: existingRecovery?.createdAt || Date.now(),
      sessionId
    });
    callbackPathWithoutSecrets();
    await navigate(AUTH_ROUTES.updatePassword, { replace: true });
  }

  async function validatedRecoverySession() {
    const expectedSession = state.recoverySession;
    const marker = recoveryRecord();
    const expectedSessionId = accessTokenSessionId(
      expectedSession?.access_token
    );
    if (
      !state.recoveryActive ||
      !marker?.sessionId ||
      marker.sessionId !== expectedSessionId
    ) {
      return null;
    }

    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();
    if (
      sessionError ||
      !recoverySessionMatches(session, marker.sessionId) ||
      session?.user?.id !== expectedSession?.user?.id
    ) {
      return null;
    }

    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser(session.access_token);
    return !userError &&
      user &&
      user.id === expectedSession.user.id
      ? {
          accessToken: session.access_token,
          sessionId: expectedSessionId,
          userId: expectedSession.user.id
        }
      : null;
  }

  async function updateRecoveryPassword(recoverySession, password) {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      body: JSON.stringify({ password }),
      headers: {
        apikey: supabasePublishableKey,
        authorization: `Bearer ${recoverySession.accessToken}`,
        "content-type": "application/json"
      },
      method: "PUT"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        body.msg || body.message || "Unable to update the password."
      );
      error.code = body.code || "";
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function finalizeAccountCreation(
    email,
    expectedSession,
    isStillCurrent = () => true
  ) {
    if (state.processingAccountConfirmation) return;
    const completionGeneration = state.authEventGeneration;
    const completionInvalidationEpoch = state.sessionInvalidationEpoch;
    state.processingAccountConfirmation = true;
    state.transition = "signup-complete";
    try {
      if (
        !isStillCurrent() ||
        !(await currentSessionMatches(expectedSession)) ||
        !isStillCurrent() ||
        completionInvalidationEpoch !== state.sessionInvalidationEpoch
      ) {
        return false;
      }
      state.rejectCallbackSessions = false;
      clearInitialCallback();
      const { cleared } = await clearSupabaseSession();
      if (!cleared) {
        state.signinNotice =
          "Your email was verified, but this browser session could not be closed safely. Refresh the page and sign in.";
        await navigate(AUTH_ROUTES.signin, { replace: true });
        return false;
      }
      if (completionGeneration !== state.authEventGeneration) return false;
      removeRecord(PENDING_SIGNUP_KEY);
      removeRecord(RECOVERY_KEY);
      writeRecord(ACCOUNT_CREATED_KEY, {
        createdAt: Date.now(),
        email: normalizeEmail(email)
      });
      callbackPathWithoutSecrets();
      await navigate(AUTH_ROUTES.accountCreated, { replace: true });
      return true;
    } finally {
      state.transition = null;
      state.processingAccountConfirmation = false;
    }
  }

  async function handleAuthEvent(event, session, generation) {
    const isCurrentEvent = () =>
      generation === state.authEventGeneration;
    if (!isCurrentEvent()) return;

    if (event === "PASSWORD_RECOVERY") {
      await beginRecovery(session);
      return;
    }

    if (
      event === "TOKEN_REFRESHED" &&
      session &&
      (state.session || sessionUsesPassword(session))
    ) {
      const validationEpoch = state.sessionInvalidationEpoch;
      const validated = await validateSession(session);
      if (
        !isCurrentEvent() ||
        validationEpoch !== state.sessionInvalidationEpoch
      ) {
        return;
      }
      if (validated) {
        const sessionStillCurrent = await currentSessionMatches(session);
        if (
          !isCurrentEvent() ||
          validationEpoch !== state.sessionInvalidationEpoch
        ) {
          return;
        }
        if (!sessionStillCurrent) {
          state.session = null;
          onSignedOut();
          await renderCurrentRoute();
          return;
        }
        state.session = validated;
        state.rejectCallbackSessions = false;
        state.recoveryActive = false;
        state.recoverySession = null;
        removeRecord(PENDING_SIGNUP_KEY);
        removeRecord(ACCOUNT_CREATED_KEY);
        removeRecord(RECOVERY_KEY);
        await renderCurrentRoute();
      } else {
        await clearSupabaseSession();
        if (!isCurrentEvent()) return;
        state.signinNotice = "Your session expired. Sign in again.";
        await navigate(AUTH_ROUTES.signin, { replace: true });
      }
      return;
    }

    if (event === "SIGNED_IN") {
      if (
        state.transition === "password-signin" ||
        state.transition?.startsWith("signup")
      ) {
        return;
      }

      const pending = pendingSignup();
      const isSignupConfirmation =
        (hasTrustedCallbackType("signup") &&
          isTemporaryEmailSession(session) &&
          (!pending?.email ||
            signupSessionMatches(session, pending.email))) ||
        (pending?.completing &&
          signupSessionMatches(session, pending.email));
      if (isSignupConfirmation) {
        if (!isCurrentEvent()) return;
        await finalizeAccountCreation(
          pending?.email || session?.user?.email || "",
          session,
          isCurrentEvent
        );
        return;
      }

      const recovery = recoveryRecord();
      const isRecovery =
        (hasTrustedCallbackType("recovery") &&
          isTemporaryEmailSession(session)) ||
        recoverySessionMatches(session, recovery?.sessionId);
      if (isRecovery) {
        if (!isCurrentEvent()) return;
        await beginRecovery(session);
        return;
      }

      if (state.recoveryActive || recovery) {
        state.recoveryActive = false;
        state.recoverySession = null;
        removeRecord(RECOVERY_KEY);
      }

      if (
        hasTrustedCallbackType("email", "magiclink") &&
        isTemporaryEmailSession(session)
      ) {
        state.transition = "blocking-passwordless";
        state.rejectCallbackSessions = false;
        await clearSupabaseSession();
        if (!isCurrentEvent()) return;
        clearInitialCallback();
        state.signinNotice =
          "Prime Role now requires your email and password. Sign in below or reset your password.";
        await navigate(AUTH_ROUTES.signin, { replace: true });
        state.transition = null;
        return;
      }

      if (state.rejectCallbackSessions) {
        await clearSupabaseSession();
        if (!isCurrentEvent()) return;
        state.signinNotice =
          "This authentication link is invalid or expired. Sign in again.";
        await navigate(AUTH_ROUTES.signin, { replace: true });
        return;
      }

      const validationEpoch = state.sessionInvalidationEpoch;
      const validated = await validateSession(session);
      if (
        !isCurrentEvent() ||
        validationEpoch !== state.sessionInvalidationEpoch
      ) {
        return;
      }
      if (!validated) {
        await clearSupabaseSession();
        if (!isCurrentEvent()) return;
        state.signinNotice = "Your session expired. Sign in again.";
        await navigate(AUTH_ROUTES.signin, { replace: true });
        return;
      }
      const sessionStillCurrent = await currentSessionMatches(session);
      if (
        !isCurrentEvent() ||
        validationEpoch !== state.sessionInvalidationEpoch
      ) {
        return;
      }
      if (!sessionStillCurrent) {
        state.session = null;
        onSignedOut();
        await renderCurrentRoute();
        return;
      }
      state.session = validated;
      state.rejectCallbackSessions = false;
      state.recoveryActive = false;
      state.recoverySession = null;
      removeRecord(PENDING_SIGNUP_KEY);
      removeRecord(ACCOUNT_CREATED_KEY);
      removeRecord(RECOVERY_KEY);
      await renderCurrentRoute();
      return;
    }

    if (event === "SIGNED_OUT") {
      state.session = null;
      state.recoverySession = null;
      onSignedOut();
      if (
        state.transition?.startsWith("signup") ||
        state.transition === "update-complete"
      ) {
        return;
      }
      state.recoveryActive = false;
      removeRecord(RECOVERY_KEY);
      await navigate(AUTH_ROUTES.signin, { replace: true });
    }
  }

  async function initialize() {
    const {
      data: { session },
      error
    } = await supabaseClient.auth.getSession();

    if (error) {
      if (
        state.queuedAuthEvent?.session &&
        state.initializationRetryCount < 2
      ) {
        state.initializationRetryCount += 1;
        await initialize();
        return;
      }
      state.initializationRetryCount = 0;
      callbackPathWithoutSecrets();
      clearInitialCallback();
      state.initialized = true;
      state.initializing = false;
      onSignedOut();
      await navigate(AUTH_ROUTES.signin, { replace: true });
      showMessage(
        elements["signin-error"],
        friendlyAuthError(error, "signin")
      );
      return;
    }
    state.initializationRetryCount = 0;

    const path = canonicalPath(window.location.pathname);
    const pending = pendingSignup();
    const recovery = recoveryRecord();
    const queuedAuthEvent = state.queuedAuthEvent;
    let restoredSession = queuedAuthEvent
      ? queuedAuthEvent.session || null
      : session || null;
    if (queuedAuthEvent?.event === "PASSWORD_RECOVERY") {
      restoredSession = queuedAuthEvent.session || null;
    }
    if (queuedAuthEvent?.event === "SIGNED_OUT") {
      restoredSession = null;
    }
    state.queuedAuthEvent = null;
    const isRecoveryCallback =
      queuedAuthEvent?.event === "PASSWORD_RECOVERY" ||
      (hasTrustedCallbackType("recovery") &&
        isTemporaryEmailSession(restoredSession)) ||
      recoverySessionMatches(restoredSession, recovery?.sessionId);
    const isSignupCallback =
      (hasTrustedCallbackType("signup") &&
        isTemporaryEmailSession(restoredSession) &&
        (!pending?.email ||
          signupSessionMatches(restoredSession, pending.email))) ||
      (pending?.completing &&
        signupSessionMatches(restoredSession, pending.email));
    const isPasswordlessCallback =
      hasTrustedCallbackType("email", "magiclink") &&
      isTemporaryEmailSession(restoredSession);
    const callbackFailed =
      Boolean(state.initialCallback.error) ||
      (state.initialCallback.hasCredentials && !restoredSession);

    const restorationGeneration = state.authEventGeneration;
    let restorationInvalidationEpoch = state.sessionInvalidationEpoch;
    const restorationIsCurrent = () =>
      restorationGeneration === state.authEventGeneration &&
      restorationInvalidationEpoch === state.sessionInvalidationEpoch;
    const adoptExpectedSessionInvalidation = () => {
      if (restorationGeneration !== state.authEventGeneration) return false;
      restorationInvalidationEpoch = state.sessionInvalidationEpoch;
      return true;
    };
    const finishInitialization = () => {
      state.initialized = true;
      state.initializing = false;
    };
    const restartInitialization = async () => {
      await initialize();
    };

    if (
      recovery &&
      restoredSession &&
      !isRecoveryCallback &&
      queuedAuthEvent?.event !== "PASSWORD_RECOVERY"
    ) {
      removeRecord(RECOVERY_KEY);
    }

    if (callbackFailed && !restoredSession) {
      const callbackWasRecovery =
        state.initialCallback.type === "recovery" ||
        path === AUTH_ROUTES.updatePassword;
      callbackPathWithoutSecrets();
      clearInitialCallback();
      onSignedOut();
      finishInitialization();

      if (callbackWasRecovery) {
        await navigate(AUTH_ROUTES.forgotPassword, { replace: true });
        showMessage(
          elements["forgot-password-error"],
          "This password-reset link is invalid or expired. Request a new one."
        );
      } else if (pending?.email) {
        await navigate(AUTH_ROUTES.verifyOtp, { replace: true });
        showMessage(
          elements["verify-otp-error"],
          "That verification link is invalid or expired. Request a new verification email."
        );
      } else {
        await navigate(AUTH_ROUTES.signup, { replace: true });
        showMessage(
          elements["signup-error"],
          "That verification link is invalid or expired. Start sign-up again."
        );
      }
      return;
    }

    if (restoredSession && isRecoveryCallback) {
      if (!restorationIsCurrent()) {
        await restartInitialization();
        return;
      }
      finishInitialization();
      await beginRecovery(restoredSession);
      return;
    }

    if (restoredSession && isSignupCallback) {
      if (!restorationIsCurrent()) {
        await restartInitialization();
        return;
      }
      finishInitialization();
      await finalizeAccountCreation(
        pending?.email || restoredSession.user?.email || "",
        restoredSession,
        restorationIsCurrent
      );
      return;
    }

    if (restoredSession && isPasswordlessCallback) {
      state.transition = "blocking-passwordless";
      state.rejectCallbackSessions = false;
      await clearSupabaseSession();
      if (!adoptExpectedSessionInvalidation()) {
        await restartInitialization();
        return;
      }
      clearInitialCallback();
      state.signinNotice =
        "Prime Role now requires your email and password. Sign in below or reset your password.";
      state.transition = null;
      finishInitialization();
      await navigate(AUTH_ROUTES.signin, { replace: true });
      return;
    }

    if (restoredSession && state.initialCallback.hasCredentials) {
      state.transition = "blocking-invalid-callback";
      await clearSupabaseSession();
      if (!adoptExpectedSessionInvalidation()) {
        await restartInitialization();
        return;
      }
      clearInitialCallback();
      state.signinNotice =
        "This authentication link is invalid or expired. Sign in again.";
      state.transition = null;
      finishInitialization();
      await navigate(AUTH_ROUTES.signin, { replace: true });
      return;
    }

    if (restoredSession) {
      const validated = await validateSession(restoredSession);
      if (!restorationIsCurrent()) {
        await restartInitialization();
        return;
      }
      if (validated) {
        const sessionStillCurrent = await currentSessionMatches(restoredSession);
        if (!restorationIsCurrent() || !sessionStillCurrent) {
          await restartInitialization();
          return;
        }
        state.session = validated;
        removeRecord(PENDING_SIGNUP_KEY);
        removeRecord(ACCOUNT_CREATED_KEY);
        removeRecord(RECOVERY_KEY);
      } else {
        await clearSupabaseSession();
        if (!adoptExpectedSessionInvalidation()) {
          await restartInitialization();
          return;
        }
        state.signinNotice =
          "Prime Role requires an email-and-password session. Sign in below.";
      }
    } else {
      onSignedOut();
    }

    callbackPathWithoutSecrets();
    clearInitialCallback();
    if (!restorationIsCurrent()) {
      await restartInitialization();
      return;
    }
    finishInitialization();
    await renderCurrentRoute();
  }

  elements["signin-form"].addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(elements["signin-error"]);
    const email = normalizeEmail(elements["signin-email"].value);
    const password = elements["signin-password"].value;

    if (!isValidEmail(email)) {
      showMessage(elements["signin-error"], "Enter a valid email address.");
      elements["signin-email"].focus();
      return;
    }
    if (!password) {
      showMessage(elements["signin-error"], "Enter your password.");
      elements["signin-password"].focus();
      return;
    }

    const returnTo =
      safeReturnTo(
        new URLSearchParams(window.location.search).get("returnTo")
      ) || "/dashboard";
    let operationGeneration = state.authEventGeneration;
    const operationInvalidationEpoch = state.sessionInvalidationEpoch;
    state.transition = "password-signin";
    setBusy(elements["signin-submit"], true, "Signing in…", "Sign in");
    let receivedSession = null;

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      receivedSession = data.session;
      operationGeneration = adoptMatchingSignInGeneration(
        receivedSession,
        operationGeneration
      );
      if (
        operationGeneration !== state.authEventGeneration ||
        operationInvalidationEpoch !== state.sessionInvalidationEpoch
      ) {
        await discardExpectedSession(receivedSession);
        return;
      }
      const validated = await validateSession(data.session);
      if (!validated) throw new Error("Session validation failed");
      if (
        operationGeneration !== state.authEventGeneration ||
        operationInvalidationEpoch !== state.sessionInvalidationEpoch ||
        !(await currentSessionMatches(receivedSession)) ||
        operationGeneration !== state.authEventGeneration ||
        operationInvalidationEpoch !== state.sessionInvalidationEpoch
      ) {
        await discardExpectedSession(receivedSession);
        return;
      }
      state.session = validated;
      state.rejectCallbackSessions = false;
      state.recoveryActive = false;
      state.recoverySession = null;
      removeRecord(RECOVERY_KEY);
      removeRecord(PENDING_SIGNUP_KEY);
      elements["signin-password"].value = "";
      await navigate(returnTo, { replace: true });
    } catch (error) {
      if (receivedSession && !state.session) {
        await discardExpectedSession(receivedSession);
      }
      if (
        operationGeneration === state.authEventGeneration &&
        operationInvalidationEpoch === state.sessionInvalidationEpoch
      ) {
        showMessage(
          elements["signin-error"],
          friendlyAuthError(error, "signin")
        );
      }
    } finally {
      if (state.transition === "password-signin") {
        state.transition = null;
      }
      setBusy(elements["signin-submit"], false, "Signing in…", "Sign in");
    }
  });

  elements["signup-form"].addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(elements["signup-error"]);
    const values = {
      confirmPassword: elements["signup-confirm-password"].value,
      email: elements["signup-email"].value,
      firstName: elements["signup-first-name"].value,
      lastName: elements["signup-last-name"].value,
      password: elements["signup-password"].value
    };
    const validation = validateSignUp(values);
    if (validation) {
      showMessage(elements["signup-error"], validation.message);
      elements[validation.field].focus();
      return;
    }

    const email = normalizeEmail(values.email);
    const previousPending = pendingSignup();
    const nextPending = {
      completing: false,
      createdAt: Date.now(),
      email,
      resendAt: Date.now() + OTP_RESEND_COOLDOWN_MS
    };
    writeRecord(PENDING_SIGNUP_KEY, nextPending);
    let operationGeneration = state.authEventGeneration;
    const operationInvalidationEpoch = state.sessionInvalidationEpoch;
    state.transition = "signup-request";
    setBusy(elements["signup-submit"], true, "Creating account…", "Sign up");

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: values.password,
        options: {
          data: {
            first_name: values.firstName.trim(),
            last_name: values.lastName.trim()
          },
          type: "signup"
        }
      });
      if (error) throw error;
      if (data.session) {
        operationGeneration = adoptMatchingSignInGeneration(
          data.session,
          operationGeneration
        );
      }
      if (
        operationGeneration !== state.authEventGeneration ||
        operationInvalidationEpoch !== state.sessionInvalidationEpoch
      ) {
        removeRecord(PENDING_SIGNUP_KEY);
        if (data.session) await discardExpectedSession(data.session);
        return;
      }

      if (data.session) {
        if (
          !(await currentSessionMatches(data.session)) ||
          operationGeneration !== state.authEventGeneration ||
          operationInvalidationEpoch !== state.sessionInvalidationEpoch
        ) {
          await discardExpectedSession(data.session);
          return;
        }
        const { cleared } = await clearSupabaseSession();
        if (operationGeneration !== state.authEventGeneration) return;
        removeRecord(PENDING_SIGNUP_KEY);
        showMessage(
          elements["signup-error"],
          cleared
            ? "Email verification is not enabled. Enable Confirm email in Supabase before accepting signups."
            : "The account request could not be completed safely. Refresh and try again."
        );
        return;
      }

      elements["signup-password"].value = "";
      elements["signup-confirm-password"].value = "";
      await navigate(AUTH_ROUTES.verifyOtp);
    } catch (error) {
      if (
        operationGeneration !== state.authEventGeneration ||
        operationInvalidationEpoch !== state.sessionInvalidationEpoch
      ) {
        removeRecord(PENDING_SIGNUP_KEY);
        return;
      }
      if (previousPending) {
        writeRecord(PENDING_SIGNUP_KEY, previousPending);
      } else {
        removeRecord(PENDING_SIGNUP_KEY);
      }
      showMessage(
        elements["signup-error"],
        friendlyAuthError(error, "signup")
      );
    } finally {
      if (state.transition === "signup-request") {
        state.transition = null;
      }
      setBusy(
        elements["signup-submit"],
        false,
        "Creating account…",
        "Sign up"
      );
    }
  });

  elements["verify-otp-form"].addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(elements["verify-otp-error"]);
    const pending = pendingSignup();
    if (!pending?.email) {
      await navigate(AUTH_ROUTES.signup, { replace: true });
      return;
    }

    const token = currentOtp(otpInputsList);
    if (!/^\d{6}$/.test(token)) {
      showMessage(
        elements["verify-otp-error"],
        "Enter the complete six-digit verification code."
      );
      otpInputsList.find((input) => !input.value)?.focus();
      return;
    }

    let operationGeneration = state.authEventGeneration;
    const operationInvalidationEpoch = state.sessionInvalidationEpoch;
    writeRecord(PENDING_SIGNUP_KEY, { ...pending, completing: true });
    state.transition = "signup-verification";
    setBusy(elements["verify-otp-submit"], true, "Verifying…", "Verify");

    try {
      const { data, error } = await supabaseClient.auth.verifyOtp({
        email: pending.email,
        token,
        type: "signup"
      });
      if (error) throw error;
      if (!data.session) throw new Error("Verification did not create a session");
      if (!signupSessionMatches(data.session, pending.email)) {
        throw new Error("Verification session did not match the signup request");
      }
      operationGeneration = adoptMatchingSignInGeneration(
        data.session,
        operationGeneration
      );
      if (
        operationGeneration !== state.authEventGeneration ||
        operationInvalidationEpoch !== state.sessionInvalidationEpoch
      ) {
        removeRecord(PENDING_SIGNUP_KEY);
        await discardExpectedSession(data.session);
        return;
      }
      const completed = await finalizeAccountCreation(
        pending.email,
        data.session,
        () =>
          operationGeneration === state.authEventGeneration &&
          operationInvalidationEpoch === state.sessionInvalidationEpoch
      );
      if (
        completed &&
        operationGeneration === state.authEventGeneration &&
        operationInvalidationEpoch === state.sessionInvalidationEpoch
      ) {
        otpInputsList.forEach((input) => {
          input.value = "";
        });
      }
    } catch (error) {
      if (
        operationGeneration !== state.authEventGeneration ||
        operationInvalidationEpoch !== state.sessionInvalidationEpoch
      ) {
        removeRecord(PENDING_SIGNUP_KEY);
        return;
      }
      writeRecord(PENDING_SIGNUP_KEY, {
        ...pending,
        completing: false
      });
      showMessage(
        elements["verify-otp-error"],
        friendlyAuthError(error, "verify")
      );
    } finally {
      if (state.transition === "signup-verification") {
        state.transition = null;
      }
      setBusy(
        elements["verify-otp-submit"],
        false,
        "Verifying…",
        "Verify"
      );
    }
  });

  elements["resend-otp"].addEventListener("click", async () => {
    clearMessage(elements["verify-otp-error"]);
    const pending = pendingSignup();
    if (!pending?.email) {
      await navigate(AUTH_ROUTES.signup, { replace: true });
      return;
    }
    if ((pending.resendAt || 0) > Date.now()) return;

    const operationGeneration = state.authEventGeneration;
    const resendAt = Date.now() + OTP_RESEND_COOLDOWN_MS;
    writeRecord(PENDING_SIGNUP_KEY, {
      ...pending,
      completing: false,
      resendAt
    });
    elements["resend-otp"].disabled = true;
    elements["resend-otp"].textContent = "Sending…";
    try {
      const { error } = await supabaseClient.auth.resend({
        email: pending.email,
        options: {
          emailRedirectTo: `${window.location.origin}${AUTH_ROUTES.accountCreated}`
        },
        type: "signup"
      });
      if (error) throw error;
      if (operationGeneration !== state.authEventGeneration) return;
      writeRecord(PENDING_SIGNUP_KEY, {
        ...pending,
        completing: false,
        resendAt
      });
      showToast("A new verification email was sent.");
    } catch (error) {
      if (operationGeneration !== state.authEventGeneration) return;
      showMessage(
        elements["verify-otp-error"],
        friendlyAuthError(error, "verify")
      );
    } finally {
      if (operationGeneration === state.authEventGeneration) {
        updateResendButton();
      }
    }
  });

  elements["forgot-password-form"].addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      clearMessage(elements["forgot-password-error"]);
      clearMessage(elements["forgot-password-notice"]);
      const email = normalizeEmail(elements["forgot-password-email"].value);
      if (!isValidEmail(email)) {
        showMessage(
          elements["forgot-password-error"],
          "Enter a valid email address."
        );
        elements["forgot-password-email"].focus();
        return;
      }

      const cooldown = resetCooldown();
      if ((cooldown?.availableAt || 0) > Date.now()) {
        showMessage(
          elements["forgot-password-notice"],
          "A reset request was recently sent. Please wait before trying again."
        );
        updateResetButton();
        return;
      }

      writeRecord(RESET_COOLDOWN_KEY, {
        availableAt: Date.now() + OTP_RESEND_COOLDOWN_MS,
        createdAt: Date.now()
      });
      const operationGeneration = state.authEventGeneration;
      setBusy(
        elements["forgot-password-submit"],
        true,
        "Sending…",
        "Send reset link"
      );
      try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}${AUTH_ROUTES.updatePassword}`
          }
        );
        if (error) throw error;
        if (operationGeneration !== state.authEventGeneration) return;
        showMessage(
          elements["forgot-password-notice"],
          "If an account exists for this email, a password-reset link is on its way."
        );
      } catch (error) {
        if (operationGeneration !== state.authEventGeneration) return;
        showMessage(
          elements["forgot-password-error"],
          friendlyAuthError(error, "reset")
        );
      } finally {
        if (operationGeneration === state.authEventGeneration) {
          elements["forgot-password-submit"].setAttribute("aria-busy", "false");
          updateResetButton();
        }
      }
    }
  );

  elements["update-password-form"].addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      clearMessage(elements["update-password-error"]);
      if (!state.recoveryActive || !state.recoverySession) {
        await navigate(AUTH_ROUTES.forgotPassword, { replace: true });
        return;
      }

      const password = elements["update-password"].value;
      const confirmPassword = elements["update-confirm-password"].value;
      const validation = validatePasswordPair(password, confirmPassword);
      if (validation) {
        showMessage(elements["update-password-error"], validation);
        elements[
          password !== confirmPassword
            ? "update-confirm-password"
            : "update-password"
        ].focus();
        return;
      }

      const expectedRecoverySession = state.recoverySession;
      const operationGeneration = state.authEventGeneration;
      const recoverySession = await validatedRecoverySession();
      if (operationGeneration !== state.authEventGeneration) return;
      if (
        !recoverySession ||
        !state.recoveryActive ||
        !sessionsMatch(state.recoverySession, expectedRecoverySession)
      ) {
        state.recoveryActive = false;
        state.recoverySession = null;
        removeRecord(RECOVERY_KEY);
        showMessage(
          elements["update-password-error"],
          "This recovery session changed or expired. Request a new password-reset link."
        );
        return;
      }

      state.transition = "update-complete";
      setBusy(
        elements["update-password-submit"],
        true,
        "Updating…",
        "Update password"
      );
      try {
        await updateRecoveryPassword(recoverySession, password);
        if (operationGeneration !== state.authEventGeneration) return;

        const recoverySessionStillCurrent = await currentSessionMatches(
          expectedRecoverySession
        );
        if (operationGeneration !== state.authEventGeneration) return;
        removeRecord(RECOVERY_KEY);
        state.recoveryActive = false;
        state.recoverySession = null;
        elements["update-password"].value = "";
        elements["update-confirm-password"].value = "";
        if (!recoverySessionStillCurrent) {
          state.signinNotice =
            "Your password was updated, but the browser session changed. Sign in again.";
          await navigate(AUTH_ROUTES.signin, { replace: true });
          return;
        }

        const { cleared } = await clearSupabaseSession();
        if (operationGeneration !== state.authEventGeneration) return;
        if (!cleared) {
          throw new Error(
            "Your password changed, but this browser session could not be closed safely."
          );
        }
        state.signinNotice =
          "Password updated successfully. Sign in with your new password.";
        await navigate(AUTH_ROUTES.signin, { replace: true });
      } catch (error) {
        if (operationGeneration !== state.authEventGeneration) return;
        showMessage(
          elements["update-password-error"],
          friendlyAuthError(error, "reset")
        );
      } finally {
        if (state.transition === "update-complete") {
          state.transition = null;
        }
        if (operationGeneration === state.authEventGeneration) {
          setBusy(
            elements["update-password-submit"],
            false,
            "Updating…",
            "Update password"
          );
        }
      }
    }
  );

  document.querySelectorAll("[data-auth-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      void navigate(link.getAttribute("href"));
    });
  });

  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = elements[button.dataset.togglePassword];
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", String(show));
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus();
    });
  });

  otpInputsList.forEach((input, index) => {
    input.addEventListener("input", (event) => {
      const digits = otpDigits(event.target.value);
      event.target.value = digits[0] || "";
      if (digits.length > 1) {
        digits.forEach((digit, offset) => {
          if (otpInputsList[index + offset]) {
            otpInputsList[index + offset].value = digit;
          }
        });
      }
      const nextIndex = Math.min(
        otpInputsList.length - 1,
        index + Math.max(1, digits.length)
      );
      if (event.target.value && nextIndex !== index) {
        otpInputsList[nextIndex].focus();
        otpInputsList[nextIndex].select();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        otpInputsList[index - 1].focus();
        otpInputsList[index - 1].value = "";
      }
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        otpInputsList[index - 1].focus();
      }
      if (event.key === "ArrowRight" && index < otpInputsList.length - 1) {
        event.preventDefault();
        otpInputsList[index + 1].focus();
      }
    });

    input.addEventListener("paste", (event) => {
      const digits = otpDigits(event.clipboardData?.getData("text"));
      if (!digits.length) return;
      event.preventDefault();
      otpInputsList.forEach((otpInput, otpIndex) => {
        otpInput.value = digits[otpIndex] || "";
      });
      otpInputsList[Math.min(digits.length, 6) - 1].focus();
    });
  });

  elements["go-to-signin"].addEventListener("click", async () => {
    const operationGeneration = state.authEventGeneration;
    const created = accountCreated();
    if (created?.email) elements["signin-email"].value = created.email;
    removeRecord(ACCOUNT_CREATED_KEY);
    removeRecord(PENDING_SIGNUP_KEY);
    const { cleared } = await clearSupabaseSession();
    if (operationGeneration !== state.authEventGeneration) return;
    if (!cleared) {
      showToast(
        "The verified session could not be closed safely. Refresh the page before signing in.",
        true
      );
      return;
    }
    await navigate(AUTH_ROUTES.signin, { replace: true });
  });

  elements["sign-out"].addEventListener("click", async () => {
    const operationGeneration = state.authEventGeneration;
    state.transition = "logout";
    const { cleared, error } = await clearSupabaseSession();
    if (operationGeneration !== state.authEventGeneration) {
      state.transition = null;
      return;
    }
    state.recoveryActive = false;
    removeRecord(RECOVERY_KEY);
    removeRecord(ACCOUNT_CREATED_KEY);
    if (cleared) {
      await navigate(AUTH_ROUTES.signin, { replace: true });
    }
    state.transition = null;
    if (!cleared || error) {
      showToast(
        cleared
          ? "You were signed out on this device."
          : "The browser session could not be cleared. Refresh and try again.",
        true
      );
    }
  });

  window.addEventListener("popstate", () => {
    void renderCurrentRoute();
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (
      suppressAuthEventImmediately({
        event,
        suppressSignedOutUntil: state.suppressSignedOutUntil,
        transition: state.transition
      })
    ) {
      if (event === "SIGNED_OUT") {
        state.suppressSignedOutUntil = 0;
        state.session = null;
        state.recoverySession = null;
        onSignedOut();
      }
      return;
    }
    const { generation, queued } = recordAuthStateChange(
      state,
      event,
      session
    );
    if (event === "SIGNED_OUT") {
      state.sessionInvalidationEpoch += 1;
      state.session = null;
      state.recoverySession = null;
      state.recoveryActive = false;
      removeRecord(RECOVERY_KEY);
      onSignedOut();
    }
    if (queued) return;
    window.setTimeout(() => {
      void handleAuthEvent(event, session, generation);
    }, 0);
  });

  return {
    getSession: () => state.session,
    initialize,
    renderCurrentRoute
  };
}
