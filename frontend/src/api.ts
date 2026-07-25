import type {
  Job,
  SearchRun,
  TailorResult,
  WorkspaceSettings
} from "./types";

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export const api = {
  health: () => fetch("/api/health").then((response) => parseResponse(response)),

  jobs: () =>
    fetch("/api/jobs").then((response) => parseResponse<Job[]>(response)),

  settings: () =>
    fetch("/api/settings").then((response) =>
      parseResponse<WorkspaceSettings>(response)
    ),

  saveSettings: (settings: WorkspaceSettings) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    }).then((response) => parseResponse<WorkspaceSettings>(response)),

  startSearch: () =>
    fetch("/api/search-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }).then((response) => parseResponse<SearchRun>(response)),

  tailor: (jobId: string) =>
    fetch(`/api/jobs/${jobId}/tailor`, { method: "POST" }).then((response) =>
      parseResponse<TailorResult>(response)
    )
};
