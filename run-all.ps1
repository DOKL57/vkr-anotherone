$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

$EnvFile = Join-Path $RootDir ".env"
$EnvExample = Join-Path $RootDir ".env.example"
$RuntimeDir = Join-Path $RootDir ".runtime"
$TunnelEnvFile = Join-Path $RuntimeDir "public-tunnel.env"
$TunnelLogFile = Join-Path $RuntimeDir "public-tunnel.log"
$TunnelPidFile = Join-Path $RuntimeDir "public-tunnel.pid"
$NpmCacheDir = Join-Path $RootDir ".npm-cache"

function Log([string]$Message) {
  Write-Host "[run-all] $Message"
}

function Fail([string]$Message) {
  Write-Host "[run-all][error] $Message" -ForegroundColor Red
  exit 1
}

function Ensure-EnvFile {
  if (-not (Test-Path $EnvFile)) {
    Log ".env missing -> copying from .env.example"
    Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
  }
}

function Import-EnvFile([string]$Path) {
  if (-not (Test-Path $Path)) { return }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Find-NodeJS {
  if ((Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    return $true
  }

  $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
  $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
  $env:Path = "$machinePath;$userPath"

  return ((Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue))
}

function Require-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker is required but not found. Install Docker Desktop: https://docs.docker.com/desktop/"
  }

  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    Fail "Docker daemon is not running. Start Docker Desktop first."
  }
}

function Ensure-TunnelDirs {
  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
  New-Item -ItemType Directory -Path $NpmCacheDir -Force | Out-Null
}

function Stop-PublicTunnel {
  if (Test-Path $TunnelPidFile) {
    $existingPid = Get-Content -LiteralPath $TunnelPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingPid) {
      Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
    }
  }

  Remove-Item -LiteralPath $TunnelPidFile, $TunnelEnvFile -Force -ErrorAction SilentlyContinue
}

function Start-PublicTunnelIfNeeded {
  Import-EnvFile $EnvFile

  if (-not $env:TELEGRAM_BOT_TOKEN -or $env:TELEGRAM_BOT_TOKEN -eq "replace_me") { return }
  if ($env:TELEGRAM_WEBAPP_URL -match "^https://") { return }

  if (-not (Find-NodeJS)) {
    Fail "Node.js is required to create public HTTPS tunnel for Telegram Mini App."
  }

  Ensure-TunnelDirs

  if (Test-Path $TunnelPidFile) {
    $existingPid = Get-Content -LiteralPath $TunnelPidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) -and (Test-Path $TunnelEnvFile)) {
      Import-EnvFile $TunnelEnvFile
      return
    }
  }

  Remove-Item -LiteralPath $TunnelLogFile, $TunnelEnvFile, $TunnelPidFile -Force -ErrorAction SilentlyContinue

  Log "Starting public HTTPS tunnel for Telegram Mini App..."
  $command = "`$env:npm_config_cache=`"$NpmCacheDir`"; Set-Location `"$RootDir`"; npx --yes localtunnel --port 3001 *>> `"$TunnelLogFile`""
  $process = Start-Process -FilePath "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath $TunnelPidFile -Value $process.Id

  $url = $null
  for ($i = 0; $i -lt 90; $i++) {
    if (Test-Path $TunnelLogFile) {
      $match = Select-String -Path $TunnelLogFile -Pattern "https://\S+" | Select-Object -First 1
      if ($match) {
        $url = $match.Matches[0].Value
        break
      }
    }
    Start-Sleep -Seconds 1
  }

  if (-not $url) {
    Fail "public tunnel start failed"
  }

  @(
    "PUBLIC_TUNNEL_URL=$url"
    "TELEGRAM_WEBAPP_URL=$url"
    "CORS_ORIGIN=$url"
  ) | Set-Content -LiteralPath $TunnelEnvFile

  Import-EnvFile $TunnelEnvFile
  Log "Public Mini App URL: $($env:TELEGRAM_WEBAPP_URL)"
}

function Show-Help {
  Write-Host @"
Sound rental helper

Usage: .\run-all.ps1 [command]

Commands:
  start     Start the full Docker stack
  stop      Stop all Docker services
  logs      Tail docker-compose logs
  restart   Restart all services
  dev       Start postgres in Docker, api/web locally
  clean     Remove containers and volumes
  help      Show this help
"@
}

function Cmd-Start {
  Log "Starting all services via Docker..."
  Ensure-EnvFile
  Start-PublicTunnelIfNeeded
  Require-Docker

  docker compose up -d --build
  if ($LASTEXITCODE -ne 0) { Fail "docker compose up failed" }

  Write-Host ""
  Write-Host "Services started." -ForegroundColor Green
  Write-Host "Web:    http://localhost:5173"
  Write-Host "API:    http://localhost:3001"
  Write-Host "Health: http://localhost:3001/health"
  if ($env:TELEGRAM_WEBAPP_URL -match "^https://") {
    Write-Host "MiniApp: $($env:TELEGRAM_WEBAPP_URL)"
  }
}

function Cmd-Stop {
  Log "Stopping all services..."
  Require-Docker
  docker compose down
  Stop-PublicTunnel
  Write-Host "Services stopped." -ForegroundColor Green
}

function Cmd-Restart {
  Cmd-Stop
  Cmd-Start
}

function Cmd-Logs {
  Log "Streaming logs..."
  Require-Docker
  docker compose logs -f
}

function Cmd-Clean {
  Log "Cleaning Docker resources..."
  Require-Docker
  docker compose down -v --remove-orphans
  Stop-PublicTunnel
  Write-Host "Cleanup complete." -ForegroundColor Green
}

function Cmd-Dev {
  Log "Starting local dev mode..."
  Ensure-EnvFile

  if (-not (Find-NodeJS)) {
    Fail "Node.js not found. Install from https://nodejs.org or use Docker mode: .\run-all.ps1 start"
  }

  Import-EnvFile $EnvFile

  if (-not $env:LOCAL_LLM_MODEL) { $env:LOCAL_LLM_MODEL = "auto" }
  if (-not $env:CORS_ORIGIN) { $env:CORS_ORIGIN = "http://localhost:5173" }
  if (-not $env:PORT) { $env:PORT = "3001" }
  if (-not $env:TELEGRAM_WEBAPP_URL) { $env:TELEGRAM_WEBAPP_URL = "http://localhost:5173" }
  if (-not $env:API_URL) { $env:API_URL = "http://localhost:3001" }
  if (-not $env:VITE_API_URL) { $env:VITE_API_URL = "http://localhost:3001" }

  Start-PublicTunnelIfNeeded

  if ($env:DATABASE_URL) {
    $env:DATABASE_URL = $env:DATABASE_URL -replace "@postgres:", "@localhost:"
  } else {
    $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/sound_rental?schema=public"
  }

  Require-Docker
  Log "Starting postgres via docker compose..."
  docker compose up -d postgres
  if ($LASTEXITCODE -ne 0) { Fail "Failed to start postgres" }

  Log "Waiting for Postgres..."
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    docker compose exec -T postgres pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { Fail "Postgres not ready after 30s" }

  if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
    Log "Installing npm dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
  }

  Log "Building web bundle for API static hosting..."
  npm run build -w @sound/web
  if ($LASTEXITCODE -ne 0) { Fail "web build failed" }

  Log "Initializing DB schema..."
  npm run db:init -w @sound/api
  if ($LASTEXITCODE -ne 0) { Fail "db:init failed" }

  Log "Seeding test data..."
  npm run db:seed -w @sound/api
  if ($LASTEXITCODE -ne 0) { Fail "db:seed failed" }

  Log "Starting API..."
  $ApiJob = Start-Job -Name "sound-api" -ScriptBlock {
    Set-Location $using:RootDir
    npm run dev:api
  }

  Log "Starting Web..."
  $WebJob = Start-Job -Name "sound-web" -ScriptBlock {
    Set-Location $using:RootDir
    npm run dev:web
  }

  $BotJob = $null
  if ($env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_BOT_TOKEN -ne "replace_me") {
    Log "Starting Telegram bot..."
    $BotJob = Start-Job -Name "sound-bot" -ScriptBlock {
      Set-Location $using:RootDir
      npm run dev:bot
    }
  } else {
    Log "TELEGRAM_BOT_TOKEN missing -> bot skipped"
  }

  Write-Host ""
  Write-Host "Ready." -ForegroundColor Green
  Write-Host "Web:    http://localhost:5173"
  Write-Host "API:    http://localhost:3001"
  Write-Host "Health: http://localhost:3001/health"
  Write-Host "LLM:    $($env:LOCAL_LLM_URL)"
  if ($env:TELEGRAM_WEBAPP_URL -match "^https://") {
    Write-Host "MiniApp: $($env:TELEGRAM_WEBAPP_URL)"
  }

  try {
    $jobs = @($ApiJob, $WebJob, $BotJob) | Where-Object { $null -ne $_ }
    while ($true) {
      foreach ($job in $jobs) {
        Receive-Job -Job $job -ErrorAction SilentlyContinue | Out-Host
      }

      $failed = $jobs | Where-Object { $_.State -in @("Failed", "Stopped", "Completed") }
      if ($failed.Count -gt 0) {
        foreach ($job in $failed) {
          Log ("Job exited: {0} ({1})" -f $job.Name, $job.State)
        }
        break
      }

      Start-Sleep -Seconds 1
    }
  } finally {
    Log "Shutting down..."
    foreach ($job in @($ApiJob, $WebJob, $BotJob)) {
      if ($null -ne $job) {
        Stop-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue | Out-Null
      }
    }

    docker compose stop postgres 2>$null | Out-Null
    Stop-PublicTunnel
    Log "Done"
  }
}

$command = if ($args.Count -gt 0) { $args[0] } else { "start" }

switch ($command) {
  "start"   { Cmd-Start }
  "stop"    { Cmd-Stop }
  "kill"    { Cmd-Stop }
  "restart" { Cmd-Restart }
  "logs"    { Cmd-Logs }
  "clean"   { Cmd-Clean }
  "dev"     { Cmd-Dev }
  "help"    { Show-Help }
  default   { Show-Help }
}
