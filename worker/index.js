import companyCatalog from "./data/companies.json" with { type: "json" };

const SUPABASE_URL = "https://trbqbwfvgvhokllpcmkx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_g4nymFXeixsMFdqZm_Hsvw_SzoNde-H";
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

const COMPANY_TYPES = Object.freeze({
  DIRECT_CLIENT: "Direct Client",
  IMPLEMENTATION: "Implementation",
  VENDOR: "Vendor"
});

const DEFAULT_SETTINGS = Object.freeze({
  base_resume_path: "",
  company_type: "IMPLEMENTATION",
  output_directory: "generated-resumes",
  start_date: "2026-07-25",
  target_roles: [
    "Software Engineer",
    "DevOps Engineer",
    "Platform Engineer"
  ]
});

const JOBS = Object.freeze([
  {
    id: "job-001",
    company_name: "Northstar Cloud",
    job_title: "Senior DevOps Engineer",
    job_url: "https://example.com/jobs/job-001",
    location: "Chicago, IL (Hybrid)",
    posted_at: "2026-07-25",
    ats_score: 76,
    sponsorship: "Confirmed",
    is_demo: true
  },
  {
    id: "job-002",
    company_name: "Atlas Systems",
    job_title: "Cloud Platform Engineer",
    job_url: "https://example.com/jobs/job-002",
    location: "Remote — United States",
    posted_at: "2026-07-24",
    ats_score: 71,
    sponsorship: "Unclear",
    is_demo: true
  },
  {
    id: "job-003",
    company_name: "Riverbank Technologies",
    job_title: "Site Reliability Engineer",
    job_url: "https://example.com/jobs/job-003",
    location: "Dallas, TX",
    posted_at: null,
    ats_score: 60,
    sponsorship: "No",
    is_demo: true
  }
]);

function json(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...additionalHeaders
    }
  });
}

function apiError(detail, status) {
  return json({ detail }, status);
}

function companyTypeFromUrl(url) {
  const selected = url.searchParams.get("company_type");
  if (!selected) return null;
  return Object.hasOwn(COMPANY_TYPES, selected) ? selected : false;
}

function companySummary(type = null) {
  return Object.entries(COMPANY_TYPES)
    .filter(([companyType]) => !type || companyType === type)
    .map(([companyType, label]) => ({
      company_type: companyType,
      label,
      company_count: companyCatalog.companies[companyType].length
    }));
}

function companies(type = null) {
  return Object.keys(COMPANY_TYPES)
    .filter((companyType) => !type || companyType === type)
    .flatMap((companyType) =>
      companyCatalog.companies[companyType].map((company) => ({
        ...company,
        company_type: companyType
      }))
    );
}

function accessTokenUsesPassword(authorization) {
  if (!String(authorization || "").startsWith("Bearer ")) return false;
  try {
    const accessToken = authorization.slice("Bearer ".length).trim();
    const payload = accessToken.split(".")[1];
    if (!payload) return false;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const claims = JSON.parse(atob(padded));
    return (
      Array.isArray(claims.amr) &&
      claims.amr.some((entry) => entry?.method === "password")
    );
  } catch {
    return false;
  }
}

async function authenticatedUser(request, env) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization
      }
    });
    if (!response.ok) return null;
    if (!accessTokenUsesPassword(authorization)) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function invalidBodyResponse(detail, status) {
  return apiError(detail, status);
}

async function readBoundedText(request) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw invalidBodyResponse("Request body is too large", 413);
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      throw invalidBodyResponse("Request body is too large", 413);
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

async function readJson(request) {
  const body = await readBoundedText(request);
  try {
    return JSON.parse(body);
  } catch {
    throw invalidBodyResponse("Invalid JSON body", 400);
  }
}

async function readOptionalJson(request) {
  const body = await readBoundedText(request);
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw invalidBodyResponse("Invalid JSON body", 400);
  }
}

function normalizeSettings(payload) {
  const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).some((key) => !allowedKeys.has(key))
  ) {
    return null;
  }

  const companyType = payload.company_type;
  const roles = payload.target_roles;
  const date = payload.start_date;
  if (
    !Object.hasOwn(COMPANY_TYPES, companyType) ||
    typeof payload.base_resume_path !== "string" ||
    typeof payload.output_directory !== "string" ||
    payload.base_resume_path.length > 260 ||
    payload.output_directory.length > 1024 ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
    !Array.isArray(roles) ||
    roles.length > 25 ||
    roles.some(
      (role) =>
        typeof role !== "string" ||
        !role.trim() ||
        role.trim().length > 120
    )
  ) {
    return null;
  }

  return {
    base_resume_path: payload.base_resume_path.trim(),
    company_type: companyType,
    output_directory: payload.output_directory.trim(),
    start_date: date,
    target_roles: [
      ...new Set(roles.map((role) => role.trim()).filter(Boolean))
    ]
  };
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { allow: "GET, PUT, POST, OPTIONS" }
    });
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      status: "ok",
      service: "Prime Role",
      mode: "demo",
      database_configured: false,
      runtime: "cloudflare-worker-javascript"
    });
  }

  if (url.pathname === "/api/public-config" && request.method === "GET") {
    return json({
      supabase_url: SUPABASE_URL,
      supabase_publishable_key: SUPABASE_PUBLISHABLE_KEY
    });
  }

  const user = await authenticatedUser(request, env);
  if (!user) return apiError("Authentication required", 401);

  if (url.pathname === "/api/jobs" && request.method === "GET") {
    return json(JOBS);
  }

  if (url.pathname === "/api/companies/summary" && request.method === "GET") {
    const selectedType = companyTypeFromUrl(url);
    if (selectedType === false) return apiError("Unknown company type", 422);
    return json(companySummary(selectedType));
  }

  if (url.pathname === "/api/companies" && request.method === "GET") {
    const selectedType = companyTypeFromUrl(url);
    if (selectedType === false) return apiError("Unknown company type", 422);
    return json(companies(selectedType));
  }

  if (url.pathname === "/api/settings" && request.method === "GET") {
    return json({ ...DEFAULT_SETTINGS, persistence: "browser_local" });
  }

  if (url.pathname === "/api/settings" && request.method === "PUT") {
    let payload;
    try {
      payload = await readJson(request);
    } catch (response) {
      return response;
    }
    const settings = normalizeSettings(payload);
    if (!settings) return apiError("Invalid workspace settings", 422);
    return json({ ...settings, persistence: "browser_local" });
  }

  if (url.pathname === "/api/search-runs" && request.method === "POST") {
    let payload;
    try {
      payload = await readOptionalJson(request);
    } catch (response) {
      return response;
    }
    const selectedType =
      payload.company_type || DEFAULT_SETTINGS.company_type;
    if (!Object.hasOwn(COMPANY_TYPES, selectedType)) {
      return apiError("Unknown company type", 422);
    }
    const checked = companyCatalog.companies[selectedType].length;
    return json({
      id: `demo-${crypto.randomUUID()}`,
      status: "completed",
      company_type: selectedType,
      companies_checked: checked,
      new_jobs: checked ? JOBS.length : 0,
      duplicates_skipped: checked ? 7 : 0,
      is_demo: true,
      message: checked
        ? `Demo only: search of ${checked} built-in ${COMPANY_TYPES[selectedType]} companies was simulated; no company websites were contacted.`
        : `Demo only: no ${COMPANY_TYPES[selectedType]} companies are configured, so no company websites were contacted.`
    });
  }

  const tailorMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/tailor$/);
  if (tailorMatch && request.method === "POST") {
    const job = JOBS.find(({ id }) => id === tailorMatch[1]);
    if (!job) return apiError("Job not found", 404);
    return json({
      job_id: job.id,
      status: "demo",
      output_path: "generated-resumes/Current_Tailored_Resume.docx",
      previous_score: job.ats_score,
      target_score: 95,
      message:
        "Demo only: resume tailoring was simulated. No file was created or overwritten."
    });
  }

  if (url.pathname === "/api/resumes/base" && request.method === "POST") {
    return apiError(
      "Base resumes stay in this browser and are never uploaded to the Worker.",
      409
    );
  }

  return apiError("API route not found", 404);
}

export const testExports = Object.freeze({
  COMPANY_TYPES,
  DEFAULT_SETTINGS,
  JOBS,
  accessTokenUsesPassword,
  companies,
  companySummary,
  normalizeSettings
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  }
};
