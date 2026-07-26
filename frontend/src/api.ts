import type {
  BaseResumeUpload,
  CompanySummary,
  CompanyType,
  Job,
  SearchRun,
  TailorResult,
  WorkspaceSettings
} from "./types";

type WorkspaceSettingsResponse = WorkspaceSettings & {
  persistence: string;
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
};

const withoutPersistence = ({
  persistence: _persistence,
  ...settings
}: WorkspaceSettingsResponse): WorkspaceSettings => settings;

export const api = {
  health: () => fetch("/api/health").then((response) => parseResponse(response)),

  jobs: () =>
    fetch("/api/jobs").then((response) => parseResponse<Job[]>(response)),

  companySummary: () =>
    fetch("/api/companies/summary").then((response) =>
      parseResponse<CompanySummary[]>(response)
    ),

  settings: () =>
    fetch("/api/settings").then((response) =>
      parseResponse<WorkspaceSettingsResponse>(response)
    ).then(withoutPersistence),

  saveSettings: (settings: WorkspaceSettings) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    })
      .then((response) => parseResponse<WorkspaceSettingsResponse>(response))
      .then(withoutPersistence),

  startSearch: (companyType: CompanyType) =>
    fetch("/api/search-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_type: companyType })
    }).then((response) => parseResponse<SearchRun>(response)),

  tailor: (jobId: string) =>
    fetch(`/api/jobs/${jobId}/tailor`, { method: "POST" }).then((response) =>
      parseResponse<TailorResult>(response)
    ),

  uploadBaseResume: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    return fetch("/api/resumes/base", {
      method: "POST",
      body: formData
    }).then((response) => parseResponse<BaseResumeUpload>(response));
  }
};
