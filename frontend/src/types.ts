export type Sponsorship = "Confirmed" | "Unclear" | "No";

export type CompanyType = "DIRECT_CLIENT" | "IMPLEMENTATION" | "VENDOR";

export type CompanySummary = {
  company_type: CompanyType;
  label: string;
  company_count: number;
};

export type Job = {
  id: string;
  company_name: string;
  job_title: string;
  job_url: string;
  location: string;
  posted_at: string | null;
  ats_score: number;
  sponsorship: Sponsorship;
};

export type WorkspaceSettings = {
  base_resume_path: string;
  company_type: CompanyType;
  output_directory: string;
  start_date: string;
  target_roles: string[];
};

export type BaseResumeUpload = {
  original_filename: string;
  stored_path: string;
  size_bytes: number;
};

export type SearchRun = {
  id: string;
  status: string;
  companies_checked: number;
  new_jobs: number;
  duplicates_skipped: number;
  is_demo: boolean;
};

export type TailorResult = {
  job_id: string;
  status: string;
  output_path: string;
  previous_score: number;
  target_score: number;
  message: string;
};
