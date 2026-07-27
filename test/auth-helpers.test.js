import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTH_ROUTES,
  accessTokenAuthMethods,
  accessTokenSessionId,
  chooseQueuedAuthEvent,
  friendlyAuthError,
  isAuthRoute,
  isOtpCodeError,
  isProtectedPath,
  normalizeEmail,
  otpCooldownSeconds,
  otpDigits,
  passwordValidationMessage,
  routeDecision,
  recoverySessionMatches,
  safeReturnTo,
  sessionUsesPassword,
  signupSessionMatches,
  suppressAuthEventImmediately,
  validatePasswordPair,
  validateSignUp
} from "../web/auth-helpers.js";
import { recordAuthStateChange } from "../web/auth-controller.js";

function accessTokenWithAmr(methods, claims = {}) {
  const payload = Buffer.from(
    JSON.stringify({
      ...claims,
      amr: methods.map((method) => ({ method }))
    })
  ).toString("base64url");
  return `header.${payload}.signature`;
}

test("auth and protected routes are classified explicitly", () => {
  for (const path of Object.values(AUTH_ROUTES)) {
    assert.equal(isAuthRoute(path), true, path);
  }
  for (const path of [
    "/",
    "/dashboard",
    "/jobs",
    "/jobs/job-001",
    "/profile",
    "/resume",
    "/settings"
  ]) {
    assert.equal(isProtectedPath(path), true, path);
  }
  assert.equal(isProtectedPath("/signin"), false);
  assert.equal(isProtectedPath("/unknown"), false);
});

test("route decisions prevent anonymous and recovery access to the workspace", () => {
  assert.deepEqual(
    routeDecision({ pathname: "/jobs", sessionValid: false }),
    { action: "redirect", path: "/signin" }
  );
  assert.deepEqual(
    routeDecision({ pathname: "/signin", sessionValid: true }),
    { action: "redirect", path: "/dashboard" }
  );
  assert.deepEqual(
    routeDecision({
      pathname: "/jobs",
      recoveryActive: true,
      sessionValid: false
    }),
    {
      action: "auth",
      path: "/update-password",
      view: "update-password"
    }
  );
  assert.deepEqual(
    routeDecision({
      pathname: "/verify-otp",
      pendingSignup: false
    }),
    { action: "redirect", path: "/signup" }
  );
  assert.deepEqual(
    routeDecision({
      pathname: "/update-password",
      recoveryActive: false,
      sessionValid: false
    }),
    { action: "redirect", path: "/forgot-password" }
  );
  assert.deepEqual(
    routeDecision({
      pathname: "/verify-otp",
      pendingSignup: true
    }),
    { action: "auth", path: "/verify-otp", view: "verify-otp" }
  );
  assert.deepEqual(
    routeDecision({
      pathname: "/verify-otp",
      pendingSignup: true,
      sessionValid: true
    }),
    { action: "redirect", path: "/dashboard" }
  );
});

test("account-created view requires a short-lived completion marker", () => {
  assert.deepEqual(
    routeDecision({
      accountCreated: false,
      pathname: "/account-created"
    }),
    { action: "redirect", path: "/signin" }
  );
  assert.deepEqual(
    routeDecision({
      accountCreated: true,
      pathname: "/account-created"
    }),
    {
      action: "auth",
      path: "/account-created",
      view: "account-created"
    }
  );
});

test("return destinations remain same-origin and protected", () => {
  assert.equal(safeReturnTo("/jobs?filter=new"), "/jobs?filter=new");
  assert.equal(safeReturnTo("/settings"), "/settings");
  assert.equal(safeReturnTo("https://evil.example/jobs"), null);
  assert.equal(safeReturnTo("//evil.example/jobs"), null);
  assert.equal(safeReturnTo("/signin"), null);
  assert.equal(safeReturnTo("/unknown"), null);
  assert.equal(
    safeReturnTo("/dashboard#access_token=attacker&refresh_token=attacker"),
    null
  );
  assert.equal(safeReturnTo("/jobs?code=forged-callback"), null);
  assert.equal(safeReturnTo("/jobs?access_token=forged-callback"), null);
  assert.equal(safeReturnTo("/jobs?id_token=forged-callback"), null);
  assert.equal(safeReturnTo("/jobs?TYPE=magiclink"), null);
});

test("signup validation enforces names, email, strength, and matching passwords", () => {
  const valid = {
    confirmPassword: "PrimeRole9",
    email: " person@example.com ",
    firstName: "Mohan",
    lastName: "Sai",
    password: "PrimeRole9"
  };
  assert.equal(validateSignUp(valid), null);
  assert.equal(normalizeEmail(valid.email), "person@example.com");
  assert.equal(
    validateSignUp({ ...valid, firstName: " " }).field,
    "signup-first-name"
  );
  assert.equal(
    validateSignUp({ ...valid, email: "wrong" }).field,
    "signup-email"
  );
  assert.equal(
    validateSignUp({ ...valid, password: "short" }).field,
    "signup-password"
  );
  assert.equal(
    validateSignUp({ ...valid, confirmPassword: "PrimeRole8" }).field,
    "signup-confirm-password"
  );
});

test("password and OTP helpers preserve the requested policy", () => {
  assert.equal(passwordValidationMessage("PrimeRole9"), null);
  assert.match(passwordValidationMessage("primerole9"), /uppercase/i);
  assert.equal(validatePasswordPair("PrimeRole9", "PrimeRole9"), null);
  assert.match(
    validatePasswordPair("PrimeRole9", "PrimeRole8"),
    /do not match/i
  );
  assert.deepEqual(otpDigits("12a 34-567"), ["1", "2", "3", "4", "5", "6"]);
  assert.equal(otpCooldownSeconds(61_000, 1_000), 60);
  assert.equal(otpCooldownSeconds(1_001, 1_000), 1);
  assert.equal(otpCooldownSeconds(999, 1_000), 0);
  assert.equal(otpCooldownSeconds("invalid", 1_000), 0);
});

test("only password-authenticated JWT sessions unlock the workspace", () => {
  const passwordToken = accessTokenWithAmr(["password"], {
    session_id: "password-session"
  });
  const otpToken = accessTokenWithAmr(["otp"], {
    session_id: "otp-session"
  });
  assert.deepEqual(accessTokenAuthMethods(passwordToken), ["password"]);
  assert.equal(accessTokenSessionId(otpToken), "otp-session");
  assert.equal(sessionUsesPassword({ access_token: passwordToken }), true);
  assert.equal(sessionUsesPassword({ access_token: otpToken }), false);
  assert.equal(sessionUsesPassword({ access_token: "invalid" }), false);
  assert.equal(
    signupSessionMatches(
      {
        access_token: otpToken,
        user: { email: "person@example.com" }
      },
      "PERSON@example.com"
    ),
    true
  );
  assert.equal(
    signupSessionMatches(
      {
        access_token: passwordToken,
        user: { email: "person@example.com" }
      },
      "person@example.com"
    ),
    false
  );
  assert.equal(
    recoverySessionMatches(
      { access_token: otpToken },
      "otp-session"
    ),
    true
  );
});

test("expected auth events are suppressed synchronously during local transitions", () => {
  assert.equal(
    suppressAuthEventImmediately({
      event: "SIGNED_IN",
      transition: "signup-verification"
    }),
    false
  );
  assert.equal(
    suppressAuthEventImmediately({
      event: "SIGNED_OUT",
      suppressSignedOutUntil: Date.now() + 1_000
    }),
    true
  );
  assert.equal(
    suppressAuthEventImmediately({
      event: "SIGNED_OUT",
      suppressSignedOutUntil: Date.now() - 1
    }),
    false
  );
});

test("a queued sign-out wins over an earlier sign-in during initialization", () => {
  const signedIn = chooseQueuedAuthEvent(
    null,
    "SIGNED_IN",
    { access_token: "stale" }
  );
  const signedOut = chooseQueuedAuthEvent(signedIn, "SIGNED_OUT", null);
  const ignoredRefresh = chooseQueuedAuthEvent(
    signedOut,
    "TOKEN_REFRESHED",
    { access_token: "also-stale" }
  );
  assert.deepEqual(signedOut, { event: "SIGNED_OUT", session: null });
  assert.equal(ignoredRefresh, signedOut);
});

test("the newest queued non-sign-out session replaces an older startup session", () => {
  const firstSession = { access_token: "first" };
  const latestSession = { access_token: "latest" };
  const first = chooseQueuedAuthEvent(null, "SIGNED_IN", firstSession);
  const latest = chooseQueuedAuthEvent(
    first,
    "TOKEN_REFRESHED",
    latestSession
  );

  assert.deepEqual(latest, {
    event: "TOKEN_REFRESHED",
    session: latestSession
  });
});

test("the controller records initialization events synchronously so sign-out cannot resurrect a queued sign-in", () => {
  const state = {
    authEventGeneration: 0,
    initialized: false,
    initializing: true,
    lastAuthEvent: null,
    queuedAuthEvent: null
  };
  const staleSession = { access_token: "stale" };

  recordAuthStateChange(state, "SIGNED_IN", staleSession);
  recordAuthStateChange(state, "SIGNED_OUT", null);

  assert.equal(state.authEventGeneration, 2);
  assert.deepEqual(state.lastAuthEvent, {
    event: "SIGNED_OUT",
    generation: 2,
    session: null
  });
  assert.deepEqual(state.queuedAuthEvent, {
    event: "SIGNED_OUT",
    generation: 2,
    session: null
  });
});

test("authentication errors are user-friendly and do not expose internals", () => {
  assert.equal(
    friendlyAuthError({ code: "invalid_credentials" }, "signin"),
    "Incorrect email or password."
  );
  assert.match(
    friendlyAuthError({ code: "email_not_confirmed" }, "signin"),
    /not verified/i
  );
  assert.match(
    friendlyAuthError({ code: "otp_expired" }, "verify"),
    /incorrect or expired/i
  );
  assert.equal(isOtpCodeError({ code: "invalid_otp" }), true);
  assert.equal(
    isOtpCodeError({ message: "Token has expired or is invalid" }),
    true
  );
  assert.equal(isOtpCodeError({ message: "Network failure" }), false);
  assert.match(
    friendlyAuthError({ status: 429 }, "signup"),
    /wait a minute/i
  );
  assert.equal(
    friendlyAuthError(new Error("private stack detail"), "signin"),
    "Unable to sign in. Please try again."
  );
});

test("browser source contains the complete password-and-OTP flow", async () => {
  const [html, controller, app, readme, setup, packageJson] = await Promise.all([
    readFile(new URL("../web/index.html", import.meta.url), "utf8"),
    readFile(new URL("../web/auth-controller.js", import.meta.url), "utf8"),
    readFile(new URL("../web/app.js", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../SUPABASE_OTP_SETUP.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8")
  ]);

  assert.equal((html.match(/class="otp-input"/g) || []).length, 6);
  for (const view of [
    "signin",
    "signup",
    "verify-otp",
    "account-created",
    "forgot-password",
    "update-password"
  ]) {
    assert.match(html, new RegExp(`data-auth-view="${view}"`));
  }
  assert.match(controller, /signInWithPassword/);
  assert.match(controller, /\.auth\.signUp/);
  assert.match(controller, /\.auth\.verifyOtp/);
  assert.match(controller, /\.auth\.resend/);
  assert.match(
    controller,
    /verifyOtp\(\{\s*email:\s*pending\.email,\s*token,\s*type:\s*"email"\s*\}\)/s
  );
  assert.match(
    controller,
    /resend\(\{\s*email:\s*pending\.email,\s*type:\s*"signup"\s*\}\)/s
  );
  assert.match(html, /id="verify-otp-notice"/);
  assert.doesNotMatch(html, /click.*confirmation link/i);
  assert.match(controller, /resetPasswordForEmail/);
  assert.match(controller, /updateRecoveryPassword/);
  assert.match(controller, /auth\/v1\/user/);
  assert.match(controller, /authEventGeneration/);
  assert.match(controller, /rejectCallbackSessions/);
  assert.match(controller, /sessionInvalidationEpoch/);
  assert.match(controller, /sessionUsesPassword/);
  assert.match(controller, /suppressSignedOutUntil/);
  assert.match(app, /authCallbackCredentialKeys/);
  assert.match(app, /initialCallbackHasCredentials/);
  assert.match(app, /settingsKeyForUser/);
  assert.match(app, /resumeIdForUser/);
  assert.match(app, /id: resumeIdForUser\(userId\)/);
  assert.doesNotMatch(controller, /signInWithOtp/);
  assert.doesNotMatch(controller, /\.auth\.updateUser/);
  assert.doesNotMatch(controller, /scope:\s*"global"/);
  assert.doesNotMatch(controller, /user\?\.identities/);
  assert.doesNotMatch(controller, /service_role/i);
  assert.doesNotMatch(controller, /hasTrustedCallbackType\("signup"\)/);
  assert.doesNotMatch(controller, /emailRedirectTo:.*accountCreated/);
  assert.doesNotMatch(app, /"\/account-created",/);
  assert.doesNotMatch(readme, /use the default confirmation link/i);
  assert.doesNotMatch(readme, /supports that link too/i);
  assert.match(setup, /custom SMTP first/i);
  assert.match(setup, /\{\{ \.Token \}\}/);
  assert.match(setup, /Do not include `\{\{ \.ConfirmationURL \}\}`/);
  assert.ok(
    setup.indexOf("custom SMTP first") <
      setup.indexOf("Email Templates → Confirm signup")
  );
  assert.match(packageJson, /--port 8788/);
});
