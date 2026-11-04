# Start Select with Docker in one command (Windows PowerShell):  .\start.ps1
# If Windows refuses to run scripts:  powershell -ExecutionPolicy Bypass -File .\start.ps1
#
# The first time, it writes .env with a random database password and encryption key.
# Then it builds and starts the containers, waits until Select answers and opens your browser.
# Run it again after `git pull` to update: your data stays in the Docker volumes.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$url = "http://localhost:3000"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Install Docker Desktop: https://docs.docker.com/desktop/setup/install/windows-install/" -ForegroundColor Red
    exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop is not running. Start it, wait until it says it is running, then run .\start.ps1 again." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path .env)) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    # 32 random bytes in URL-safe base64: the format of a Fernet key.
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    $secret = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_')
    $alphabet = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    $one = New-Object byte[] 1
    $password = -join (1..24 | ForEach-Object { $rng.GetBytes($one); $alphabet[$one[0] % $alphabet.Length] })
    (Get-Content .env.example) `
        -replace '^POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$password" `
        -replace '^SELECT_SECRET_KEY=.*', "SELECT_SECRET_KEY=$secret" `
        -replace 'select:change-me@', "select:$password@" |
        Set-Content -Encoding ascii .env
    Write-Host "Created .env with a random database password and encryption key."
    Write-Host "Keep a copy of .env somewhere safe: without it, stored API keys and mailbox passwords cannot be read."
}

docker compose up --build -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "docker compose failed: see the messages above." -ForegroundColor Red
    exit 1
}

Write-Host -NoNewline "Waiting for Select"
for ($i = 0; $i -lt 120; $i++) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$url/api/health" -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            Write-Host ""
            Write-Host "Select is running: $url"
            Write-Host "The first visit creates the owner account."
            Start-Process $url
            exit 0
        }
    }
    catch {
        # Not answering yet: the containers are still starting.
        Write-Host -NoNewline "."
    }
    Start-Sleep -Seconds 2
}
Write-Host ""
Write-Host "Select did not answer within 4 minutes. See what happened with: docker compose logs --tail 50" -ForegroundColor Red
exit 1
