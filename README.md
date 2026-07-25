# Prime Role

Prime Role is a local-first job discovery and resume-tailoring application. It uses a React/Vite/TypeScript frontend and a Python 3.13 FastAPI backend in one repository. Supabase PostgreSQL can store companies, discovered jobs, search runs, and application history.

The current implementation is the **first working slice**. Its demo endpoints and sample job data prove the frontend/backend integration; they are not yet the production collectors, ATS engine, sponsorship classifier, or resume-tailoring workflow.

## Technology

- Python 3.13 and FastAPI
- React, Vite, and TypeScript
- Supabase PostgreSQL (integration-ready)
- Playwright for future career-site collection
- One repository and one production web service

During development, Vite and FastAPI run on separate local ports for fast reloads. After `frontend` is built, FastAPI serves the compiled frontend so the application runs as one service.

## Repository layout

```text
prime-role/
├── backend/               FastAPI API and automation code
├── frontend/              React/Vite/TypeScript interface
├── scripts/
│   ├── dev.sh             macOS/Linux development launcher
│   └── dev.ps1            Windows PowerShell development launcher
├── .env.example
├── .gitignore
└── README.md
```

## Prerequisites

Install:

- Git
- Python 3.13
- Node.js 24 LTS with npm
- VS Code, IntelliJ IDEA Ultimate, or PyCharm Professional
- A Supabase project when database-backed features are enabled

JDK is not required for this Python/React implementation.

## macOS setup

### 1. Install tools

With [Homebrew](https://brew.sh/):

```bash
brew install git python@3.13 node
```

Confirm the installations:

```bash
git --version
python3.13 --version
node --version
npm --version
```

### 2. Prepare the repository

```bash
git clone <repository-url> prime-role
cd prime-role
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
npm --prefix frontend install
cp .env.example .env
```

Add Supabase and other private credentials to `.env`. Never commit that file. The demo slice can run with blank Supabase values.

### 3. Start development

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

## Windows setup

Run these commands in PowerShell.

### 1. Install tools

Using Windows Package Manager:

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.13 -e
winget install --id OpenJS.NodeJS.LTS -e
```

Close and reopen PowerShell, then confirm:

```powershell
git --version
py -3.13 --version
node --version
npm --version
```

### 2. Prepare the repository

```powershell
git clone <repository-url> prime-role
Set-Location prime-role
py -3.13 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
npm --prefix frontend install
Copy-Item .env.example .env
```

Add Supabase and other private credentials to `.env`. Never commit that file. The demo slice can run with blank Supabase values.

### 3. Start development

```powershell
.\scripts\dev.ps1
```

## Local addresses

When the development launcher is running:

- Frontend: `http://127.0.0.1:5173`
- FastAPI: `http://127.0.0.1:8000`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

Set `BACKEND_PORT` or `FRONTEND_PORT` before starting the launcher to override either port.

## Run services separately

This is useful when debugging in an IDE.

Backend:

```bash
source .venv/bin/activate
python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
npm --prefix frontend run dev
```

On Windows, activate the environment with `.\.venv\Scripts\Activate.ps1`; the remaining commands are the same.

## Build as one application

Build the React frontend:

```bash
npm --prefix frontend run build
```

Then run FastAPI:

```bash
python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

FastAPI serves `frontend/dist` when that build exists. Open `http://127.0.0.1:8000`.

## Supabase configuration

Create a Supabase project and copy `.env.example` to `.env`. Configure:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` only if a server-side administrative operation requires it

The browser must never receive the database password or service-role key. React calls FastAPI, and FastAPI performs privileged database and automation work.

## Planned MVP flow

1. Upload an Excel sheet containing approximately 250 companies.
2. Select a base resume, output folder, and search-from date.
3. Collect new public jobs without repeating previously seen job IDs or canonical URLs.
4. Show company name, job title, job URL, ATS score, and sponsorship status (`Confirmed`, `Unclear`, or `No`).
5. Tailor a resume for one selected job from the untouched base resume.
6. Replace only the previously generated resume, never the base resume.
7. Preserve search history so the next run covers the previous run date through today.

ATS percentages are application-defined similarity scores, not guarantees of how an employer's private ATS will score a resume. Tailoring must remain truthful and must not invent skills or experience.
