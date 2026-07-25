import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type {
  Job,
  Sponsorship,
  TailorResult,
  WorkspaceSettings
} from "./types";

const defaultSettings: WorkspaceSettings = {
  base_resume_path: "data/Mohan_Resume.docx",
  company_file_path: "data/target-companies.xlsx",
  output_directory: "generated-resumes",
  start_date: "2026-07-25",
  target_roles: ["Software Engineer", "DevOps", "Platform Engineer"]
};

const companyColors = ["#635bff", "#0b3d91", "#632ca6", "#007a5a"];

function ScoreRing({ score }: { score: number }) {
  return (
    <div
      aria-label={`${score}% internal ATS match`}
      className="score-ring"
      style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}
    >
      <span>{score}%</span>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function pathName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [settings, setSettings] =
    useState<WorkspaceSettings>(defaultSettings);
  const [draft, setDraft] = useState<WorkspaceSettings>(defaultSettings);
  const [activeNav, setActiveNav] = useState("Jobs");
  const [search, setSearch] = useState("");
  const [sponsorship, setSponsorship] = useState<
    Sponsorship | "All sponsorship"
  >("All sponsorship");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [tailoringId, setTailoringId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [connection, setConnection] = useState<
    "connecting" | "online" | "offline"
  >("connecting");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        await api.health();
        const [jobData, savedSettings] = await Promise.all([
          api.jobs(),
          api.settings()
        ]);
        setJobs(jobData);
        setSettings(savedSettings);
        setDraft(savedSettings);
        setConnection("online");
      } catch {
        setConnection("offline");
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const visibleJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const matchesText = `${job.company_name} ${job.job_title}`
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesSponsorship =
          sponsorship === "All sponsorship" ||
          job.sponsorship === sponsorship;
        return matchesText && matchesSponsorship;
      }),
    [jobs, search, sponsorship]
  );

  const openSettings = () => {
    setDraft(settings);
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    try {
      const saved = await api.saveSettings(draft);
      setSettings(saved);
      setSettingsOpen(false);
      setNotice("Workspace settings saved");
    } catch {
      setNotice("Could not save settings. Start the backend and try again.");
    }
  };

  const runSearch = async () => {
    setIsSearching(true);
    try {
      const run = await api.startSearch();
      const label = run.is_demo ? "Demo search completed" : "Search completed";
      setNotice(
        `${label}: ${run.companies_checked} companies, ${run.new_jobs} new jobs`
      );
    } catch {
      setNotice("Could not start the search. Check the backend connection.");
    } finally {
      setIsSearching(false);
    }
  };

  const tailorResume = async (job: Job) => {
    setTailoringId(job.id);
    try {
      setTailorResult(await api.tailor(job.id));
    } catch {
      setNotice("Could not tailor this resume. Check the backend connection.");
    } finally {
      setTailoringId(null);
    }
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>Prime Role</strong>
            <span>Career workspace</span>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          {[
            ["Jobs", "⌕"],
            ["Run history", "↻"],
            ["Applications", "✓"],
            ["Settings", "⚙"]
          ].map(([label, icon]) => (
            <button
              className={activeNav === label ? "nav-item active" : "nav-item"}
              key={label}
              onClick={() => {
                setActiveNav(label);
                if (label === "Settings") openSettings();
              }}
              type="button"
            >
              <span className="nav-icon">{icon}</span>
              {label}
              {label === "Jobs" && (
                <span className="nav-count">{jobs.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <span className={`status-dot ${connection}`} />
          <div>
            <strong>
              {connection === "online"
                ? "Backend connected"
                : connection === "connecting"
                  ? "Connecting…"
                  : "Backend offline"}
            </strong>
            <p>First runnable development slice</p>
          </div>
        </div>

        <div className="profile">
          <div className="avatar">MR</div>
          <div>
            <strong>Mohan Reddy</strong>
            <span>Job search workspace</span>
          </div>
          <button aria-label="Profile menu" type="button">
            •••
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark">P</div>
            <strong>Prime Role</strong>
          </div>
          <label className="search-box">
            <span>⌕</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search jobs or companies"
              value={search}
            />
            <kbd>⌘ K</kbd>
          </label>
          <span className="slice-pill">DEVELOPMENT SLICE</span>
          <button className="help-button" type="button">
            ?
          </button>
        </header>

        <div className="content">
          {connection === "offline" && (
            <div className="connection-banner" role="alert">
              <strong>Backend is not running.</strong>
              <span>
                Start FastAPI on port 8000, then refresh this page.
              </span>
            </div>
          )}

          <section className="hero">
            <div>
              <p className="eyebrow">JOB DISCOVERY</p>
              <h1>
                Your next opportunity,
                <br />
                all in one place.
              </h1>
              <p className="hero-copy">
                Find new roles across your company list, compare your match and
                create a truthful tailored resume when you are ready.
              </p>
            </div>
            <button
              className="run-button"
              disabled={connection !== "online" || isSearching}
              onClick={() => void runSearch()}
              type="button"
            >
              <span>↻</span>
              {isSearching ? "Running search…" : "Run job search"}
            </button>
          </section>

          <section className="setup-card">
            <div className="setup-heading">
              <div>
                <span className="section-kicker">SEARCH SETUP</span>
                <h2>Today&apos;s workspace</h2>
              </div>
              <button
                className="edit-button"
                onClick={openSettings}
                type="button"
              >
                <span>✎</span> Edit setup
              </button>
            </div>

            <div className="setup-grid">
              <div className="setup-item">
                <span className="setup-icon green">▱</span>
                <div>
                  <label>Base resume</label>
                  <strong>{pathName(settings.base_resume_path)}</strong>
                  <span className="protected">● Protected original</span>
                </div>
              </div>
              <div className="setup-item">
                <span className="setup-icon blue">▦</span>
                <div>
                  <label>Company list</label>
                  <strong>{pathName(settings.company_file_path)}</strong>
                  <span>250 companies configured</span>
                </div>
              </div>
              <div className="setup-item">
                <span className="setup-icon amber">◫</span>
                <div>
                  <label>Find jobs posted since</label>
                  <strong>{formatDate(settings.start_date)}</strong>
                  <span>Previously seen jobs excluded</span>
                </div>
              </div>
              <div className="setup-item">
                <span className="setup-icon violet">⌁</span>
                <div>
                  <label>Tailored resume output</label>
                  <strong>{pathName(settings.output_directory)}</strong>
                  <span>Replaces current generated file only</span>
                </div>
              </div>
            </div>
          </section>

          <section className="results-section">
            <div className="results-heading">
              <div>
                <div className="heading-line">
                  <h2>New matching jobs</h2>
                  <span className="result-badge">{visibleJobs.length}</span>
                </div>
                <p>
                  Sample data is served by FastAPI until collectors are
                  connected.
                </p>
              </div>
              <div className="result-actions">
                <select
                  aria-label="Filter by sponsorship"
                  onChange={(event) =>
                    setSponsorship(
                      event.target.value as Sponsorship | "All sponsorship"
                    )
                  }
                  value={sponsorship}
                >
                  <option>All sponsorship</option>
                  <option>Confirmed</option>
                  <option>Unclear</option>
                  <option>No</option>
                </select>
                <button className="export-button" type="button">
                  ⇩ Export
                </button>
              </div>
            </div>

            <div className="jobs-table">
              <div className="table-head">
                <span>COMPANY</span>
                <span>JOB</span>
                <span>JOB URL</span>
                <span>ATS SCORE</span>
                <span>SPONSORSHIP</span>
                <span />
              </div>

              {visibleJobs.map((job, index) => (
                <article className="job-row" key={job.id}>
                  <div className="company-cell" data-label="Company">
                    <span
                      className="company-logo"
                      style={{
                        background:
                          companyColors[index % companyColors.length]
                      }}
                    >
                      {job.company_name.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{job.company_name}</strong>
                  </div>
                  <div className="job-cell" data-label="Job">
                    <strong>{job.job_title}</strong>
                    <span>{job.location}</span>
                    <em>{formatDate(job.posted_at)}</em>
                  </div>
                  <a
                    className="job-url"
                    data-label="Job URL"
                    href={job.job_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>{job.job_url}</span> ↗
                  </a>
                  <div className="score-cell" data-label="ATS Score">
                    <ScoreRing score={job.ats_score} />
                    <span>
                      {job.ats_score >= 70 ? "Good match" : "Can improve"}
                    </span>
                  </div>
                  <div data-label="Sponsorship">
                    <span
                      className={`sponsor-chip ${job.sponsorship.toLowerCase()}`}
                    >
                      <i />
                      {job.sponsorship}
                    </span>
                  </div>
                  <button
                    className="tailor-button"
                    disabled={tailoringId !== null}
                    onClick={() => void tailorResume(job)}
                    type="button"
                  >
                    {tailoringId === job.id ? "Tailoring…" : "Tailor resume"}
                    <span>→</span>
                  </button>
                </article>
              ))}

              {visibleJobs.length === 0 && (
                <div className="empty-state">
                  {connection === "offline"
                    ? "Start the backend to load jobs."
                    : "No jobs match the current filters."}
                </div>
              )}
            </div>

            <div className="results-footer">
              <p>
                <span>✓</span> Duplicate prevention will use source job ID,
                canonical URL and stable content hash.
              </p>
              <button type="button">View run details →</button>
            </div>
          </section>

          <footer>
            <span>Prime Role v0.1 development slice</span>
            <span>Frontend and backend in one repository</span>
          </footer>
        </div>
      </section>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="settings-title"
            aria-modal="true"
            className="settings-modal"
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <span className="section-kicker">EDIT WORKSPACE</span>
                <h2 id="settings-title">Search and resume setup</h2>
              </div>
              <button
                aria-label="Close settings"
                className="close-button"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="form-grid">
              <label>
                Base resume path
                <input
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      base_resume_path: event.target.value
                    })
                  }
                  value={draft.base_resume_path}
                />
                <small>The original file will never be overwritten.</small>
              </label>
              <label>
                Company spreadsheet
                <input
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      company_file_path: event.target.value
                    })
                  }
                  value={draft.company_file_path}
                />
              </label>
              <label>
                Find jobs posted since
                <input
                  onChange={(event) =>
                    setDraft({ ...draft, start_date: event.target.value })
                  }
                  type="date"
                  value={draft.start_date}
                />
              </label>
              <label>
                Tailored resume output folder
                <input
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      output_directory: event.target.value
                    })
                  }
                  value={draft.output_directory}
                />
              </label>
              <label className="full-field">
                Target roles
                <input
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      target_roles: event.target.value
                        .split(",")
                        .map((role) => role.trim())
                        .filter(Boolean)
                    })
                  }
                  value={draft.target_roles.join(", ")}
                />
              </label>
            </div>

            <div className="modal-note">
              <span>i</span>
              Settings are held in memory for this first slice. Supabase
              persistence is scaffolded for the next implementation step.
            </div>

            <div className="modal-actions">
              <button
                className="cancel-button"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="save-button"
                onClick={() => void saveSettings()}
                type="button"
              >
                Save changes
              </button>
            </div>
          </section>
        </div>
      )}

      {tailorResult && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="tailor-title"
            aria-modal="true"
            className="success-modal"
            role="dialog"
          >
            <div className="success-icon">✓</div>
            <span className="section-kicker">DEMO RESULT</span>
            <h2 id="tailor-title">Resume workflow connected</h2>
            <p>{tailorResult.message}</p>
            <div className="score-improvement">
              <div>
                <span>Current score</span>
                <strong>{tailorResult.previous_score}%</strong>
              </div>
              <span className="improvement-arrow">→</span>
              <div>
                <span>Target score</span>
                <strong>{tailorResult.target_score}%</strong>
              </div>
            </div>
            <div className="file-preview">
              <span>W</span>
              <div>
                <strong>{pathName(tailorResult.output_path)}</strong>
                <small>{tailorResult.output_path}</small>
              </div>
            </div>
            <div className="demo-warning">
              No resume file is generated by this development slice.
            </div>
            <div className="success-actions">
              <button
                className="cancel-button"
                onClick={() => setTailorResult(null)}
                type="button"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast">
          <span>✓</span>
          {notice}
        </div>
      )}
    </main>
  );
}
