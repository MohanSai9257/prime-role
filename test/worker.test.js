import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker, { testExports } from "../worker/index.js";

const env = {
  ASSETS: {
    fetch: async () =>
      new Response("<html>Prime Role</html>", {
        headers: { "content-type": "text/html" }
      })
  }
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
  if (String(input) === "https://trbqbwfvgvhokllpcmkx.supabase.co/auth/v1/user") {
    return new Response(
      JSON.stringify({ email: "test@example.com", id: "test-user" }),
      {
        headers: { "content-type": "application/json" },
        status: options.headers?.authorization ? 200 : 401
      }
    );
  }
  return originalFetch(input, options);
};
test.after(() => {
  globalThis.fetch = originalFetch;
});

async function request(path, options) {
  const headers = new Headers(options?.headers);
  if (!headers.has("authorization")) {
    headers.set("authorization", authorizationWithAmr(["password"]));
  }
  return worker.fetch(
    new Request(`https://prime-role.test${path}`, { ...options, headers }),
    env
  );
}

function authorizationWithAmr(methods) {
  const payload = Buffer.from(
    JSON.stringify({ amr: methods.map((method) => ({ method })) })
  ).toString("base64url");
  return `Bearer header.${payload}.signature`;
}

test("health identifies the JavaScript Worker runtime", async () => {
  const response = await request("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "Prime Role",
    mode: "demo",
    database_configured: false,
    runtime: "cloudflare-worker-javascript"
  });
});

test("public config exposes only the Supabase publishable client settings", async () => {
  const response = await request("/api/public-config");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    supabase_url: "https://trbqbwfvgvhokllpcmkx.supabase.co",
    supabase_publishable_key:
      "sb_publishable_g4nymFXeixsMFdqZm_Hsvw_SzoNde-H"
  });
});

test("company catalog preserves all spreadsheet categories and counts", async () => {
  const response = await request("/api/companies/summary");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    {
      company_type: "DIRECT_CLIENT",
      label: "Direct Client",
      company_count: 0
    },
    {
      company_type: "IMPLEMENTATION",
      label: "Implementation",
      company_count: 230
    },
    {
      company_type: "VENDOR",
      label: "Vendor",
      company_count: 0
    }
  ]);

  const companies = await (
    await request("/api/companies?company_type=IMPLEMENTATION")
  ).json();
  assert.equal(companies.length, 230);
  assert.equal(companies[0].company_name, "Cognizant");
  assert.equal(companies[0].company_type, "IMPLEMENTATION");
});

test("jobs preserve the frontend contract and sponsorship ordering", async () => {
  const jobs = await (await request("/api/jobs")).json();
  assert.equal(jobs.length, 3);
  assert.deepEqual(
    jobs.map(({ sponsorship }) => sponsorship),
    ["Confirmed", "Unclear", "No"]
  );
  assert.deepEqual(
    Object.keys(jobs[0]).sort(),
    [
      "ats_score",
      "company_name",
      "id",
      "is_demo",
      "job_title",
      "job_url",
      "location",
      "posted_at",
      "sponsorship"
    ]
  );
});

test("search uses the selected catalog and reports empty types", async () => {
  const defaultRun = await (
    await request("/api/search-runs", { method: "POST" })
  ).json();
  assert.equal(defaultRun.company_type, "IMPLEMENTATION");
  assert.equal(defaultRun.companies_checked, 230);

  const implementation = await (
    await request("/api/search-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company_type: "IMPLEMENTATION" })
    })
  ).json();
  assert.equal(implementation.companies_checked, 230);
  assert.equal(implementation.new_jobs, 3);
  assert.equal(implementation.duplicates_skipped, 7);

  const vendor = await (
    await request("/api/search-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company_type: "VENDOR" })
    })
  ).json();
  assert.equal(vendor.companies_checked, 0);
  assert.equal(vendor.new_jobs, 0);
  assert.equal(vendor.duplicates_skipped, 0);
});

test("settings normalize roles and reject unknown fields", () => {
  const valid = testExports.normalizeSettings({
    base_resume_path: "  Resume.docx ",
    company_type: "IMPLEMENTATION",
    output_directory: " generated-resumes ",
    start_date: "2026-07-25",
    target_roles: [" DevOps Engineer ", "DevOps Engineer", "SRE"]
  });
  assert.deepEqual(valid, {
    base_resume_path: "Resume.docx",
    company_type: "IMPLEMENTATION",
    output_directory: "generated-resumes",
    start_date: "2026-07-25",
    target_roles: ["DevOps Engineer", "SRE"]
  });
  assert.equal(
    testExports.normalizeSettings({ ...valid, unexpected: true }),
    null
  );
  assert.equal(
    testExports.normalizeSettings({
      ...valid,
      target_roles: ["x".repeat(121)]
    }),
    null
  );
});

test("request bodies are capped even without a Content-Length header", async () => {
  const response = await request("/api/search-runs", {
    body: "x".repeat(64 * 1024 + 1),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    detail: "Request body is too large"
  });
});

test("tailoring remains explicit demo behavior", async () => {
  const response = await request("/api/jobs/job-001/tailor", {
    method: "POST"
  });
  const result = await response.json();
  assert.equal(result.previous_score, 76);
  assert.equal(result.target_score, 95);
  assert.match(result.message, /No file was created/i);

  const missing = await request("/api/jobs/missing/tailor", {
    method: "POST"
  });
  assert.equal(missing.status, 404);
});

test("protected API routes require an authenticated session", async () => {
  const response = await worker.fetch(
    new Request("https://prime-role.test/api/jobs"),
    { ASSETS: env.ASSETS }
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { detail: "Authentication required" });
});

test("protected APIs accept only password-authenticated access tokens", async () => {
  assert.equal(
    testExports.accessTokenUsesPassword(authorizationWithAmr(["password"])),
    true
  );
  assert.equal(
    testExports.accessTokenUsesPassword(authorizationWithAmr(["otp"])),
    false
  );
  assert.equal(testExports.accessTokenUsesPassword("Bearer invalid"), false);

  const otpResponse = await worker.fetch(
    new Request("https://prime-role.test/api/jobs", {
      headers: { authorization: authorizationWithAmr(["otp"]) }
    }),
    { ASSETS: env.ASSETS }
  );
  assert.equal(otpResponse.status, 401);
  assert.deepEqual(await otpResponse.json(), {
    detail: "Authentication required"
  });
});

test("non-API requests are delegated to static assets", async () => {
  const response = await request("/dashboard");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Prime Role/);
});

test("source contains no service-role credential", async () => {
  const files = await Promise.all([
    readFile(new URL("../web/app.js", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.js", import.meta.url), "utf8"),
    readFile(new URL("../web/_headers", import.meta.url), "utf8")
  ]);
  assert.equal(files.join("\n").includes("service_role"), false);
  assert.equal(files.join("\n").includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(files.join("\n").includes("PRIME_ROLE_AUTH_BYPASS"), false);
  assert.match(files[2], /Content-Security-Policy:/);
  assert.match(files[2], /frame-ancestors 'none'/);
});
