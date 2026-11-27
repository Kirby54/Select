# Start Select on this Windows machine without Docker, then open the desktop window.
#   .\scripts\start-desktop.ps1            start everything (database, API, worker, web) and open the window
#   .\scripts\start-desktop.ps1 -Stop      stop what this script started
# If Windows refuses to run scripts:  powershell -ExecutionPolicy Bypass -File .\scripts\start-desktop.ps1
#
# Needs: uv (Python), Node.js 22, Rust (only the first time, to build the window).
# Data lives in -DataDir (default: %LOCALAPPDATA%\Select): the embedded PostgreSQL, the API data and the logs.
# The database is a local, single-user PostgreSQL (pgserver) for this computer only, in "local" sign-in mode.
param(
    [string]$DataDir = (Join-Path $env:LOCALAPPDATA "Select"),
    [switch]$Stop
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Logs = Join-Path $DataDir "logs"
$PidFile = Join-Path $DataDir "pids.txt"
$Venv = Join-Path $DataDir "venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Url = "http://localhost:3000"

if ($Stop) {
    if (Test-Path $PidFile) {
        foreach ($id in Get-Content $PidFile) {
            try { Stop-Process -Id ([int]$id) -Force -ErrorAction Stop } catch { Write-Host "Process $id was already stopped." }
        }
        Remove-Item $PidFile
    }
    Get-Process select-desktop -ErrorAction SilentlyContinue | Stop-Process
    if (Test-Path $Python) {
        $stopScript = Join-Path $DataDir "stop-pg.py"
        "import pgserver`npgserver.get_server(r'$DataDir\pg', cleanup_mode='stop').cleanup()" | Set-Content -Encoding utf8 $stopScript
        & $Python $stopScript
    }
    Write-Host "Select stopped."
    exit 0
}

foreach ($tool in "uv", "node", "npm") {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Write-Host "$tool is not installed." -ForegroundColor Red; exit 1 }
}
New-Item -ItemType Directory -Force $DataDir, $Logs, (Join-Path $DataDir "data") | Out-Null

# 1. Python environment (kept outside the repository: Windows path limits) and the embedded PostgreSQL.
$env:UV_PROJECT_ENVIRONMENT = $Venv
Push-Location $Root
uv sync --all-packages --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "uv sync failed." -ForegroundColor Red; exit 1 }
uv pip install --python $Python --quiet "pgserver==0.1.4"
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Installing pgserver failed." -ForegroundColor Red; exit 1 }
Pop-Location

# (Python code goes through small files: Windows PowerShell 5.1 mangles quotes in -c arguments.)
$pgScript = Join-Path $DataDir "start-pg.py"
@"
import time
import pgserver
# After an unclean shutdown PostgreSQL replays its log first and can take longer than pgserver's 10 s start
# timeout; the server keeps starting in the background, so a later attempt finds it running.
for attempt in range(12):
    try:
        srv = pgserver.get_server(r'$DataDir\pg', cleanup_mode=None)
        srv.psql('SELECT 1;')
        break
    except Exception as exc:  # broad on purpose: any start failure is retried, the last one is raised
        if attempt == 11:
            raise
        print('PostgreSQL is still starting:', type(exc).__name__, flush=True)
        time.sleep(5)
exists = srv.psql("SELECT 1 FROM pg_database WHERE datname = 'select_app';").strip()
if '1' not in exists.split():
    srv.psql('CREATE DATABASE select_app;')
print(srv.get_uri())
"@ | Set-Content -Encoding utf8 $pgScript
$uri = & $Python $pgScript
if ($LASTEXITCODE -ne 0) { Write-Host "The embedded PostgreSQL did not start." -ForegroundColor Red; exit 1 }
$uri = ($uri | Select-Object -Last 1).Trim()
$env:SELECT_DATABASE_URL = ($uri -replace "^postgresql://", "postgresql+psycopg://") -replace "/postgres$", "/select_app"
$env:SELECT_DATA_DIR = Join-Path $DataDir "data"
$env:SELECT_AUTH_MODE = "local"
$env:PYTHONPATH = "$Root\apps\api;$Root\packages\select-verify"

# 2. Database migrations (script location given explicitly so deep folders still work).
$migrateScript = Join-Path $DataDir "migrate.py"
@"
from alembic import command
from alembic.config import Config
from select_api.config import get_settings
here = r'$Root\apps\api\select_api'
cfg = Config(here + r'\alembic.ini')
cfg.set_main_option('script_location', here + r'\migrations')
cfg.set_main_option('sqlalchemy.url', get_settings().database_url.replace('%', '%%'))
command.upgrade(cfg, 'head')
"@ | Set-Content -Encoding utf8 $migrateScript
& $Python $migrateScript
if ($LASTEXITCODE -ne 0) { Write-Host "Database migration failed." -ForegroundColor Red; exit 1 }

# 3. API and worker.
$started = @()
$api = Start-Process -PassThru -WindowStyle Hidden -FilePath (Join-Path $Venv "Scripts\select-api.exe") -ArgumentList "serve", "--port", "8000" `
    -RedirectStandardOutput "$Logs\api.log" -RedirectStandardError "$Logs\api.err.log"
$worker = Start-Process -PassThru -WindowStyle Hidden -FilePath (Join-Path $Venv "Scripts\select-api.exe") -ArgumentList "worker" `
    -RedirectStandardOutput "$Logs\worker.log" -RedirectStandardError "$Logs\worker.err.log"
$started += $api.Id, $worker.Id

# 4. Web interface (production build, made once).
$web = Join-Path $Root "apps\web"
if (-not (Test-Path (Join-Path $web "node_modules"))) { npm ci --prefix $web; if ($LASTEXITCODE -ne 0) { exit 1 } }
if (-not (Test-Path (Join-Path $web ".next\BUILD_ID"))) { npm run build --prefix $web; if ($LASTEXITCODE -ne 0) { exit 1 } }
# The app is built as a standalone server (as in the Docker image): copy its static files next to it and run it.
$standalone = Join-Path $web ".next\standalone"
foreach ($pair in @(@(".next\static", ".next\static"), @("public", "public"))) {
    $to = Join-Path $standalone $pair[1]
    New-Item -ItemType Directory -Force $to | Out-Null
    Copy-Item -Recurse -Force (Join-Path (Join-Path $web $pair[0]) "*") $to
}
$env:SELECT_API_URL = "http://127.0.0.1:8000"
$env:PORT = "3000"
$env:HOSTNAME = "127.0.0.1"
$webProc = Start-Process -PassThru -WindowStyle Hidden -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $standalone `
    -RedirectStandardOutput "$Logs\web.log" -RedirectStandardError "$Logs\web.err.log"
$started += $webProc.Id
$started | Set-Content $PidFile

Write-Host -NoNewline "Waiting for Select"
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        if ((Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/health" -TimeoutSec 3).StatusCode -eq 200) { $ok = $true; break }
    } catch { Write-Host -NoNewline "." }
    Start-Sleep -Seconds 1
}
Write-Host ""
if (-not $ok) { Write-Host "Select did not answer in 90 s; see the logs in $Logs" -ForegroundColor Red; exit 1 }

# 5. The desktop window (built once with Rust; falls back to the browser).
$desktop = Join-Path $Root "apps\desktop"
$target = Join-Path $DataDir "desktop-build"
$exe = Join-Path $target "release\select-desktop.exe"
if (-not (Test-Path $exe) -and (Get-Command cargo -ErrorAction SilentlyContinue)) {
    if (-not (Test-Path (Join-Path $desktop "node_modules"))) { npm install --prefix $desktop }
    $env:CARGO_TARGET_DIR = $target
    Push-Location $desktop
    npx tauri build --no-bundle
    Pop-Location
}
if (Test-Path $exe) { Start-Process $exe } else { Start-Process $Url }
Write-Host "Select is running: $Url   (stop it with .\scripts\start-desktop.ps1 -Stop; logs in $Logs)"
