# VSA Marketing Calendar — Windows launcher
# Lives in the synced "_main" folder. Run it one of these ways:
#   - Right-click this file > "Run with PowerShell", or
#   - In PowerShell:  powershell -ExecutionPolicy Bypass -File "<path>\launch.ps1"
#
# It copies the host code to a local folder (outside OneDrive), writes .env,
# installs dependencies, starts the host, and opens the browser.

$ErrorActionPreference = "Stop"

$main  = $PSScriptRoot
$src   = Join-Path $main "sharepoint-host"
$local = Join-Path $env:USERPROFILE "vsa-marketing-calendar-host"

Write-Host "== VSA Marketing Calendar launcher ==" -ForegroundColor Cyan

# 1. Node.js present?
try { $nodev = (node -v) } catch { $nodev = $null }
if (-not $nodev) {
  Write-Host "Node.js not found. Install the LTS from https://nodejs.org, then re-run." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}
Write-Host "Node $nodev"

# 2. Code present next to this script?
if (-not (Test-Path (Join-Path $src "package.json"))) {
  Write-Host "Can't find 'sharepoint-host' next to this script." -ForegroundColor Red
  Write-Host "Run this launcher from the synced '_main' folder." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}

# 3. Locate the shared _data folder (sibling of _main)
$data = Join-Path $main "..\_data"
if (Test-Path $data) { $data = (Resolve-Path $data).Path }
else { $data = Read-Host "Could not find ..\_data. Paste the full path to the shared _data folder" }
if (-not (Test-Path $data)) { Write-Host "Invalid _data path." -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
Write-Host "Data folder: $data"

# 4. Copy code to the local run folder (exclude node_modules/.env/dist).
#    robocopy exit codes 0-7 are success; 8+ is a real error.
Write-Host "Copying code to $local ..."
robocopy $src $local /E /NFL /NDL /NJH /NJS /XD node_modules dist /XF .env | Out-Null
if ($LASTEXITCODE -ge 8) { Write-Host "Copy failed (robocopy $LASTEXITCODE)." -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

# 5. USER_ID (defaults to the Windows username)
$default = $env:USERNAME
$uid = Read-Host "Your USER_ID (e.g. selena.ky.kuo) [Enter = $default]"
if ([string]::IsNullOrWhiteSpace($uid)) { $uid = $default }

# 6. Omnis API key (reuse an existing local .env if it already has one)
$envFile = Join-Path $local ".env"
$key = $null
if (Test-Path $envFile) {
  $existing = Get-Content $envFile | Where-Object { $_ -like "OMNIS_API_KEY=*" } | Select-Object -First 1
  if ($existing) { $key = $existing.Substring("OMNIS_API_KEY=".Length) }
}
if (-not $key -or $key -eq "your-omnis-key-here") { $key = Read-Host "Paste the Omnis API key" }

# 7. Write .env (UTF-8 without BOM so Node's dotenv reads it cleanly)
$envContent = @"
OMNIS_URL=https://omnis.viewsonic.com:8007/ask
OMNIS_API_KEY=$key
USER_ID=$uid
SHAREPOINT_DIR=$data
PORT=3000
"@
[System.IO.File]::WriteAllText($envFile, $envContent, (New-Object System.Text.UTF8Encoding $false))

# 8. Install dependencies on first run
Push-Location $local
if (-not (Test-Path (Join-Path $local "node_modules"))) {
  Write-Host "Installing dependencies (first run, ~1 min)..."
  npm install
}
Pop-Location

# 9. Start the host in its own window (stays running)
Write-Host "Starting host..."
Start-Process powershell -ArgumentList "-NoExit","-Command","Set-Location '$local'; npm run serve"

# 10. Open the browser
Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"
Write-Host "Done. Open http://localhost:3000 in Chrome or Edge.  USER_ID=$uid" -ForegroundColor Green
Read-Host "Press Enter to close this window"
