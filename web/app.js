import { createAuthController } from "./auth-controller.js";

const SUPABASE_URL = "https://trbqbwfvgvhokllpcmkx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_g4nymFXeixsMFdqZm_Hsvw_SzoNde-H";
const SETTINGS_KEY = "prime-role:workspace-settings:v1";
const RESUME_DATABASE = "prime-role-local-files";
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const initialHashParameters = new URLSearchParams(
  window.location.hash.slice(1)
);
const initialSearchParameters = new URLSearchParams(window.location.search);
const authCallbackKeys = [
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
];
const authCallbackCredentialKeys = [
  "access_token",
  "code",
  "id_token",
  "refresh_token",
  "token_hash"
];
const callbackPathAllowed = [
  "/account-created",
  "/update-password"
].includes(window.location.pathname.replace(/\/+$/, "") || "/");
const detectedCallbackCredentials = authCallbackCredentialKeys.some(
  (key) =>
    initialHashParameters.has(key) || initialSearchParameters.has(key)
);
const detectedCallbackMaterial = authCallbackKeys.some(
  (key) =>
    initialHashParameters.has(key) || initialSearchParameters.has(key)
);

if (detectedCallbackMaterial && !callbackPathAllowed) {
  const sanitizedSearch = new URLSearchParams(window.location.search);
  authCallbackKeys.forEach((key) => sanitizedSearch.delete(key));
  const safeHash = authCallbackKeys.some((key) =>
    initialHashParameters.has(key)
  )
    ? ""
    : window.location.hash;
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${
      sanitizedSearch.size ? `?${sanitizedSearch}` : ""
    }${safeHash}`
  );
}

const initialCallbackHasCredentials =
  callbackPathAllowed && detectedCallbackCredentials;
const INITIAL_AUTH_CALLBACK = Object.freeze({
  error: callbackPathAllowed
    ? initialHashParameters.get("error") ||
      initialSearchParameters.get("error") ||
      ""
    : "",
  errorCode: callbackPathAllowed
    ? initialHashParameters.get("error_code") ||
      initialSearchParameters.get("error_code") ||
      ""
    : "",
  hasCredentials: initialCallbackHasCredentials,
  type: initialCallbackHasCredentials
    ? (
        initialHashParameters.get("type") ||
        initialSearchParameters.get("type") ||
        ""
      ).toLowerCase()
    : ""
});

const DEFAULT_SETTINGS = {
  base_resume_path: "",
  company_type: "IMPLEMENTATION",
  output_directory: "generated-resumes",
  start_date: "2026-07-25",
  target_roles: [
    "Software Engineer",
    "DevOps Engineer",
    "Platform Engineer"
  ]
};

const COMPANY_COLORS = ["#635bff", "#0b3d91", "#632ca6", "#007a5a"];

const state = {
  session: null,
  jobs: [],
  companySummary: [],
  settings: { ...DEFAULT_SETTINGS },
  search: "",
  sponsorship: "All sponsorship",
  online: false,
  loadedForUser: null
};

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map((element) => [
    element.id,
    element
  ])
);

if (!window.supabase?.createClient) {
  elements["auth-loading"].classList.add("hidden");
  elements["auth-screen"].classList.remove("hidden");
  elements["signin-view"].classList.remove("hidden");
  showAuthError(
    elements["signin-error"],
    "The Supabase browser library did not load. Refresh the page."
  );
  throw new Error("Supabase browser library unavailable");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  }
);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pathName(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).at(-1) || value;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function safeJobUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

function showAuthError(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function showToast(message, error = false) {
  elements["toast-message"].textContent = message;
  elements["toast-icon"].textContent = error ? "!" : "✓";
  elements.toast.classList.toggle("error", error);
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(
    () => elements.toast.classList.add("hidden"),
    3200
  );
}

function settingsKeyForUser(userId) {
  return `${SETTINGS_KEY}:${userId}`;
}

function resumeIdForUser(userId) {
  return `base:${userId}`;
}

function readLocalSettings(userId) {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    const stored = JSON.parse(
      localStorage.getItem(settingsKeyForUser(userId))
    );
    return stored && typeof stored === "object"
      ? { ...DEFAULT_SETTINGS, ...stored }
      : null;
  } catch {
    return null;
  }
}

function persistSettings(userId = state.session?.user?.id) {
  if (!userId) return;
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.setItem(
    settingsKeyForUser(userId),
    JSON.stringify(state.settings)
  );
}

function openResumeDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RESUME_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("resumes")) {
        request.result.createObjectStore("resumes", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeBaseResume(file, userId) {
  const database = await openResumeDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction("resumes", "readwrite");
    const store = transaction.objectStore("resumes");
    store.delete("base");
    store.put({
      id: resumeIdForUser(userId),
      blob: file,
      lastModified: file.lastModified,
      name: file.name,
      size: file.size,
      type: file.type
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getBaseResumeMetadata(userId) {
  const database = await openResumeDatabase();
  const result = await new Promise((resolve, reject) => {
    const transaction = database.transaction("resumes", "readwrite");
    const store = transaction.objectStore("resumes");
    store.delete("base");
    const request = store.get(resumeIdForUser(userId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

async function validateDocx(file) {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Upload a Microsoft Word DOCX file.");
  }
  if (!file.size) throw new Error("The selected DOCX file is empty.");
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("The base resume must be 10 MB or smaller.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const zipSignature =
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(bytes[2]);
  if (!zipSignature) {
    throw new Error("The selected file is not a valid Word DOCX document.");
  }

  const zipText = new TextDecoder("latin1").decode(bytes);
  if (
    !zipText.includes("[Content_Types].xml") ||
    !zipText.includes("word/document.xml")
  ) {
    throw new Error("The selected file is not a valid Word DOCX document.");
  }
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  if (state.session?.access_token) {
    headers.set("authorization", `Bearer ${state.session.access_token}`);
  }
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.detail || `Request failed with status ${response.status}`);
  }
  return body;
}

function resetWorkspaceData() {
  window.clearTimeout(showToast.timeout);
  elements.toast.classList.add("hidden");
  elements["settings-modal"].classList.add("hidden");
  elements["tailor-modal"].classList.add("hidden");
  elements["toast-message"].textContent = "";
  elements["tailor-message"].textContent = "";
  elements["current-score"].textContent = "—";
  elements["target-score"].textContent = "—";
  elements["tailor-file-name"].textContent = "No file selected";
  elements["tailor-output-path"].textContent = "";
  elements["resume-file"].value = "";
  elements["upload-resume"].disabled = false;
  elements["run-search"].disabled = true;
  elements["run-search-label"].textContent = "Run job search";
  elements["job-search"].value = "";
  elements["sponsorship-filter"].value = "All sponsorship";
  elements["profile-email"].textContent = "Signed-in user";
  elements["profile-initials"].textContent = "PR";
  elements["settings-company-type"].value =
    DEFAULT_SETTINGS.company_type;
  elements["settings-start-date"].value = DEFAULT_SETTINGS.start_date;
  elements["settings-output-directory"].value =
    DEFAULT_SETTINGS.output_directory;
  elements["settings-target-roles"].value =
    DEFAULT_SETTINGS.target_roles.join(", ");
  state.jobs = [];
  state.companySummary = [];
  state.settings = { ...DEFAULT_SETTINGS };
  state.search = "";
  state.sponsorship = "All sponsorship";
  state.online = false;
  renderWorkspace();
}

function showSignedOut() {
  state.session = null;
  state.loadedForUser = null;
  resetWorkspaceData();
}

async function showSignedIn(session) {
  const userId = session.user.id;
  const needsUserLoad = state.loadedForUser !== userId;
  state.session = session;
  if (needsUserLoad) {
    state.loadedForUser = null;
    resetWorkspaceData();
  }
  elements["auth-loading"].classList.add("hidden");
  elements["auth-screen"].classList.add("hidden");
  elements["workspace-screen"].classList.remove("hidden");

  const email = session.user.email || "Signed-in user";
  elements["profile-email"].textContent = email;
  elements["profile-initials"].textContent = email.slice(0, 2).toUpperCase();

  if (needsUserLoad) {
    const loaded = await loadWorkspace(userId);
    if (loaded && state.session?.user?.id === userId) {
      state.loadedForUser = userId;
    }
  }
}

async function loadWorkspace(userId) {
  setConnection("connecting");
  try {
    const [health, jobs, summary, remoteSettings, resume] = await Promise.all([
      apiRequest("/api/health"),
      apiRequest("/api/jobs"),
      apiRequest("/api/companies/summary"),
      apiRequest("/api/settings"),
      getBaseResumeMetadata(userId).catch(() => null)
    ]);
    if (state.session?.user?.id !== userId) return false;
    void health;
    state.jobs = jobs;
    state.companySummary = summary;
    const localSettings = readLocalSettings(userId);
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...remoteSettings,
      ...localSettings
    };
    if (resume?.name) state.settings.base_resume_path = resume.name;
    persistSettings(userId);
    setConnection("online");
    renderWorkspace();
    return true;
  } catch (error) {
    if (state.session?.user?.id !== userId) return false;
    setConnection("offline");
    showToast(error.message || "Could not load the workspace.", true);
    return false;
  }
}

function setConnection(status) {
  state.online = status === "online";
  elements["status-dot"].className = `status-dot ${status}`;
  elements["connection-title"].textContent =
    status === "online"
      ? "Worker connected"
      : status === "connecting"
        ? "Connecting…"
        : "Worker offline";
  elements["connection-banner"].classList.toggle(
    "hidden",
    status !== "offline"
  );
  elements["run-search"].disabled = status !== "online";
}

function selectedCompanySummary() {
  return state.companySummary.find(
    ({ company_type: type }) => type === state.settings.company_type
  );
}

function visibleJobs() {
  const summary = selectedCompanySummary();
  if (summary?.company_count === 0) return [];
  return state.jobs.filter((job) => {
    const matchesText = `${job.company_name} ${job.job_title}`
      .toLowerCase()
      .includes(state.search.toLowerCase());
    const matchesSponsorship =
      state.sponsorship === "All sponsorship" ||
      job.sponsorship === state.sponsorship;
    return matchesText && matchesSponsorship;
  });
}

function renderWorkspace() {
  const summary = selectedCompanySummary();
  elements["job-count-nav"].textContent = String(state.jobs.length);
  elements["company-type"].value = state.settings.company_type;
  elements["company-count"].textContent = summary
    ? `${summary.company_count} companies configured`
    : "Company count unavailable";
  elements["base-resume-name"].textContent =
    state.settings.base_resume_path || "No resume uploaded";
  elements["settings-resume-name"].textContent =
    state.settings.base_resume_path || "No resume uploaded";
  elements["upload-resume"].textContent = state.settings.base_resume_path
    ? "Replace base resume"
    : "Upload base resume";
  elements["start-date-display"].textContent = formatDate(
    state.settings.start_date
  );
  elements["output-directory-display"].textContent =
    pathName(state.settings.output_directory) || "Not configured";
  renderJobs();
}

function renderJobs() {
  const jobs = visibleJobs();
  elements["visible-job-count"].textContent = String(jobs.length);

  if (!jobs.length) {
    elements["job-rows"].innerHTML = `<div class="empty-state">${
      state.online
        ? "No jobs match the current filters."
        : "Reconnect to the Worker to load jobs."
    }</div>`;
    return;
  }

  elements["job-rows"].innerHTML = jobs
    .map(
      (job, index) => {
        const atsScore = Number.isFinite(Number(job.ats_score))
          ? Math.min(100, Math.max(0, Math.round(Number(job.ats_score))))
          : 0;
        const sponsorship = ["Confirmed", "Unclear", "No"].includes(
          job.sponsorship
        )
          ? job.sponsorship
          : "Unclear";
        const jobUrl = safeJobUrl(job.job_url);
        return `
      <article class="job-row">
        <div class="company-cell" data-label="Company">
          <span class="company-logo" style="background:${COMPANY_COLORS[index % COMPANY_COLORS.length]}">
            ${escapeHtml(job.company_name.slice(0, 2).toUpperCase())}
          </span>
          <strong>${escapeHtml(job.company_name)}</strong>
        </div>
        <div class="job-cell" data-label="Job">
          <strong>${escapeHtml(job.job_title)}</strong>
          <span>${escapeHtml(job.location)}</span>
          <em>${escapeHtml(formatDate(job.posted_at))}</em>
        </div>
        <a class="job-url" data-label="Job URL" href="${escapeHtml(jobUrl)}"
          rel="noopener noreferrer" target="_blank">
          <span>${escapeHtml(jobUrl === "#" ? "Invalid job URL" : jobUrl)}</span> ↗
        </a>
        <div class="score-cell" data-label="ATS Score">
          <div aria-label="${atsScore}% internal ATS match" class="score-ring"
            style="--score:${atsScore * 3.6}deg">
            <span>${atsScore}%</span>
          </div>
          <span>${atsScore >= 70 ? "Good match" : "Can improve"}</span>
        </div>
        <div data-label="Sponsorship">
          <span class="sponsor-chip ${sponsorship.toLowerCase()}">
            <i></i>${escapeHtml(sponsorship)}
          </span>
        </div>
        <button class="tailor-button" data-tailor-job="${escapeHtml(job.id)}"
          ${state.settings.base_resume_path ? "" : "disabled"}
          title="${state.settings.base_resume_path ? "Tailor resume" : "Upload a base resume first"}"
          type="button">
          Tailor resume <span>→</span>
        </button>
      </article>
    `;
      }
    )
    .join("");
}

function openSettings() {
  elements["settings-company-type"].value = state.settings.company_type;
  elements["settings-start-date"].value = state.settings.start_date;
  elements["settings-output-directory"].value =
    state.settings.output_directory;
  elements["settings-target-roles"].value =
    state.settings.target_roles.join(", ");
  elements["settings-resume-name"].textContent =
    state.settings.base_resume_path || "No resume uploaded";
  elements["settings-modal"].classList.remove("hidden");
}

async function saveSettings() {
  const userId = state.session?.user?.id;
  if (!userId) return;
  const nextSettings = {
    ...state.settings,
    company_type: elements["settings-company-type"].value,
    output_directory: elements["settings-output-directory"].value.trim(),
    start_date: elements["settings-start-date"].value,
    target_roles: elements["settings-target-roles"].value
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean)
  };

  try {
    const saved = await apiRequest("/api/settings", {
      body: JSON.stringify(nextSettings),
      method: "PUT"
    });
    if (state.session?.user?.id !== userId) return;
    delete saved.persistence;
    state.settings = saved;
    persistSettings(userId);
    elements["settings-modal"].classList.add("hidden");
    renderWorkspace();
    showToast("Workspace settings saved");
  } catch (error) {
    if (state.session?.user?.id === userId) {
      showToast(error.message, true);
    }
  }
}

async function runSearch() {
  const userId = state.session?.user?.id;
  if (!userId) return;
  elements["run-search"].disabled = true;
  elements["run-search-label"].textContent = "Running search…";
  try {
    const run = await apiRequest("/api/search-runs", {
      body: JSON.stringify({
        company_type: state.settings.company_type,
        start_date: state.settings.start_date,
        target_roles: state.settings.target_roles
      }),
      method: "POST"
    });
    if (state.session?.user?.id !== userId) return;
    showToast(
      `Demo search completed: ${run.companies_checked} companies, ${run.new_jobs} new jobs`
    );
  } catch (error) {
    if (state.session?.user?.id === userId) {
      showToast(error.message, true);
    }
  } finally {
    if (state.session?.user?.id === userId) {
      elements["run-search"].disabled = !state.online;
      elements["run-search-label"].textContent = "Run job search";
    }
  }
}

async function tailorResume(jobId, button) {
  const userId = state.session?.user?.id;
  if (!userId) return;
  button.disabled = true;
  button.firstChild.textContent = "Tailoring… ";
  try {
    const result = await apiRequest(
      `/api/jobs/${encodeURIComponent(jobId)}/tailor`,
      { method: "POST" }
    );
    if (state.session?.user?.id !== userId) return;
    elements["tailor-message"].textContent = result.message;
    elements["current-score"].textContent = `${result.previous_score}%`;
    elements["target-score"].textContent = `${result.target_score}%`;
    elements["tailor-file-name"].textContent = pathName(result.output_path);
    elements["tailor-output-path"].textContent = result.output_path;
    elements["tailor-modal"].classList.remove("hidden");
  } catch (error) {
    if (state.session?.user?.id === userId) {
      showToast(error.message, true);
    }
  } finally {
    if (state.session?.user?.id === userId) {
      button.disabled = false;
      button.firstChild.textContent = "Tailor resume ";
    }
  }
}

elements["job-search"].addEventListener("input", (event) => {
  state.search = event.target.value;
  renderJobs();
});

elements["sponsorship-filter"].addEventListener("change", (event) => {
  state.sponsorship = event.target.value;
  renderJobs();
});

elements["company-type"].addEventListener("change", async (event) => {
  const userId = state.session?.user?.id;
  if (!userId) return;
  state.settings.company_type = event.target.value;
  persistSettings(userId);
  renderWorkspace();
  try {
    await apiRequest("/api/settings", {
      body: JSON.stringify(state.settings),
      method: "PUT"
    });
  } catch (error) {
    if (state.session?.user?.id === userId) {
      showToast(error.message, true);
    }
  }
});

elements["upload-resume"].addEventListener("click", () =>
  elements["resume-file"].click()
);

elements["resume-file"].addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const userId = state.session?.user?.id;
  if (!userId) {
    showToast("Sign in before uploading a base resume.", true);
    event.target.value = "";
    return;
  }
  elements["upload-resume"].disabled = true;
  elements["upload-resume"].textContent = "Validating…";
  try {
    await validateDocx(file);
    if (state.session?.user?.id !== userId) {
      throw new Error("The signed-in account changed during the upload.");
    }
    await storeBaseResume(file, userId);
    if (state.session?.user?.id !== userId) {
      throw new Error("The signed-in account changed during the upload.");
    }
    state.settings.base_resume_path = file.name;
    persistSettings(userId);
    renderWorkspace();
    showToast(`${file.name} saved locally as the base resume`);
  } catch (error) {
    if (state.session?.user?.id === userId) {
      showToast(error.message, true);
    }
  } finally {
    event.target.value = "";
    if (state.session?.user?.id === userId) {
      elements["upload-resume"].disabled = false;
      renderWorkspace();
    }
  }
});

elements["run-search"].addEventListener("click", runSearch);
elements["open-settings"].addEventListener("click", openSettings);
elements["save-settings"].addEventListener("click", saveSettings);
document.querySelectorAll("[data-close-settings]").forEach((button) =>
  button.addEventListener("click", () =>
    elements["settings-modal"].classList.add("hidden")
  )
);
document.querySelectorAll("[data-nav]").forEach((button) =>
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-nav]")
      .forEach((item) => item.classList.toggle("active", item === button));
    if (button.dataset.nav === "Settings") openSettings();
  })
);
elements["close-tailor"].addEventListener("click", () =>
  elements["tailor-modal"].classList.add("hidden")
);
elements["job-rows"].addEventListener("click", (event) => {
  const button = event.target.closest("[data-tailor-job]");
  if (button) void tailorResume(button.dataset.tailorJob, button);
});

const authController = createAuthController({
  elements,
  initialCallback: INITIAL_AUTH_CALLBACK,
  onAuthenticated: showSignedIn,
  onSignedOut: showSignedOut,
  showToast,
  supabaseClient,
  supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
  supabaseUrl: SUPABASE_URL
});

await authController.initialize();
