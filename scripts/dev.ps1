$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PythonPath = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$NodeModulesPath = Join-Path $ProjectRoot "frontend\node_modules"
$BackendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "8000" }
$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5173" }

if (-not (Test-Path $PythonPath)) {
    Write-Error "Python virtual environment not found at $ProjectRoot\.venv. Create it with: py -3.13 -m venv .venv"
}

if (-not (Test-Path $NodeModulesPath)) {
    Write-Error "Frontend dependencies are not installed. Run: npm --prefix frontend install"
}

Write-Host "Starting FastAPI at http://127.0.0.1:$BackendPort"
$Backend = Start-Process `
    -FilePath $PythonPath `
    -ArgumentList @(
        "-m", "uvicorn", "app.main:app",
        "--app-dir", "backend",
        "--reload",
        "--host", "127.0.0.1",
        "--port", $BackendPort
    ) `
    -WorkingDirectory $ProjectRoot `
    -NoNewWindow `
    -PassThru

try {
    Write-Host "Starting React at http://127.0.0.1:$FrontendPort"
    $Frontend = Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList @(
            "--prefix", "frontend",
            "run", "dev", "--",
            "--host", "127.0.0.1",
            "--port", $FrontendPort
        ) `
        -WorkingDirectory $ProjectRoot `
        -NoNewWindow `
        -PassThru

    while (-not $Backend.HasExited -and -not $Frontend.HasExited) {
        Start-Sleep -Milliseconds 500
        $Backend.Refresh()
        $Frontend.Refresh()
    }

    if ($Backend.HasExited) {
        exit $Backend.ExitCode
    }

    exit $Frontend.ExitCode
}
finally {
    if ($Backend -and -not $Backend.HasExited) {
        Stop-Process -Id $Backend.Id
    }

    if ($Frontend -and -not $Frontend.HasExited) {
        Stop-Process -Id $Frontend.Id
    }
}
