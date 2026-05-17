# =============================================================================
# Canteen Hackathon - One-shot Vercel Deploy Script (Windows PowerShell)
#
# Usage:
#   .\scripts\deploy-vercel.ps1                # interactive: link + sync env + preview
#   .\scripts\deploy-vercel.ps1 -Prod          # promote to production
#   .\scripts\deploy-vercel.ps1 -EnvOnly       # only push env vars, no deploy
#
# Prerequisites:
#   - Node.js >= 20 with npm (for `npx vercel`)
#   - Vercel CLI installed: npm i -g vercel    (or this script will use npx)
#   - Logged in: vercel login
#   - apps\web\.env.local filled in
#
# If you can't run scripts:
#   PowerShell (admin):  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#   Or run once with:    powershell -ExecutionPolicy Bypass -File .\scripts\deploy-vercel.ps1
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Prod,
    [switch]$EnvOnly,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# Force UTF-8 for child processes (Windows codepage 936/GBK breaks env values
# that contain non-ASCII or Base64 padding characters).
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# ---- helpers ----------------------------------------------------------------
function Say  ($msg) { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Ok   ($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn ($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Die  ($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

if ($Help) {
@"
Canteen Hackathon - Vercel Deploy Script

Usage:
  .\scripts\deploy-vercel.ps1            # preview deploy
  .\scripts\deploy-vercel.ps1 -Prod      # production deploy
  .\scripts\deploy-vercel.ps1 -EnvOnly   # only sync env vars
"@
    exit 0
}

# ---- locate project root ----------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root      = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$EnvFile   = Join-Path $Root 'apps\web\.env.local'

Set-Location $Root

# ---- pick vercel CLI invocation ---------------------------------------------
# Prefer global `vercel`; fall back to `npx vercel`.
$VercelExe = $null
$VercelArgsPrefix = @()

if (Get-Command vercel -ErrorAction SilentlyContinue) {
    $VercelExe = 'vercel'
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
    $VercelExe = 'npx'
    $VercelArgsPrefix = @('--yes', 'vercel')
    Warn "global 'vercel' not found, will use 'npx vercel' (slower first run)"
} else {
    Die "Neither 'vercel' nor 'npx' is on PATH. Install Node.js, then run: npm i -g vercel"
}

function Invoke-Vercel {
    param([Parameter(ValueFromRemainingArguments=$true)] [string[]]$Args)
    $full = @($VercelArgsPrefix + $Args)
    & $VercelExe @full
}

function Invoke-VercelQuiet {
    # like Invoke-Vercel but discards stdout/stderr and returns $LASTEXITCODE-friendly bool
    param([Parameter(ValueFromRemainingArguments=$true)] [string[]]$Args)
    $full = @($VercelArgsPrefix + $Args)
    & $VercelExe @full *> $null
    return ($LASTEXITCODE -eq 0)
}

# ---- pre-flight -------------------------------------------------------------
if (-not (Invoke-VercelQuiet 'whoami')) {
    Die "not logged in. Run: vercel login"
}

if (-not (Test-Path $EnvFile)) {
    Die "missing $EnvFile"
}

$who = (Invoke-Vercel 'whoami' 2>$null) -join ''
Ok "vercel CLI ready (user: $who)"

# ---- link project (idempotent) ----------------------------------------------
$ProjectJson = Join-Path $Root '.vercel\project.json'
if (-not (Test-Path $ProjectJson)) {
    Say "linking project (first time only)..."
    Invoke-Vercel 'link' '--yes'
    if ($LASTEXITCODE -ne 0) { Die "vercel link failed" }
    Ok "linked"
} else {
    try {
        $proj = Get-Content $ProjectJson -Raw | ConvertFrom-Json
        Ok "project already linked ($($proj.projectId))"
    } catch {
        Ok "project already linked"
    }
}

# ---- sync env vars from .env.local -----------------------------------------
Say "syncing env vars from $EnvFile -> Vercel ..."

$Targets = @('production', 'preview', 'development')
$Pushed  = 0
$Skipped = 0

# Read .env.local as UTF-8, line by line.
$lines = Get-Content -LiteralPath $EnvFile -Encoding UTF8

foreach ($raw in $lines) {
    $line = $raw.TrimEnd("`r")
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.TrimStart().StartsWith('#'))   { continue }

    # Match KEY=VALUE  (KEY: letters/digits/_, not starting with digit)
    $m = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
    if (-not $m.Success) { continue }

    $key = $m.Groups[1].Value
    $val = $m.Groups[2].Value

    # Strip surrounding quotes if present
    if ($val.Length -ge 2) {
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or
            ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
    }

    if ([string]::IsNullOrEmpty($val)) {
        Write-Host ("  - skip  {0,-45} (empty)" -f $key) -ForegroundColor DarkGray
        $Skipped++
        continue
    }

    foreach ($t in $Targets) {
        # remove first (silent), then add fresh
        Invoke-VercelQuiet 'env' 'rm' $key $t '--yes' | Out-Null

        # `vercel env add` reads the value from stdin.
        # Capture stderr so silent failures surface (e.g. preview slot rejects).
        $errOut = $val | & $VercelExe @VercelArgsPrefix env add $key $t 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            $firstLine = ($errOut -split "`n" | Select-Object -First 1).Trim()
            Warn ("env add failed for {0}/{1}: {2}" -f $key, $t, $firstLine)
        }
    }
    Write-Host ("  + set   {0,-45} -> [{1}]" -f $key, ($Targets -join ' ')) -ForegroundColor Green
    $Pushed++
}

Ok "env sync done: $Pushed pushed, $Skipped skipped (empty)"

# Verify env presence per target — catches silent failures.
Say "verifying env coverage on Vercel ..."
$envLs = & $VercelExe @VercelArgsPrefix env ls 2>$null | Out-String
foreach ($t in $Targets) {
    $cap = $t.Substring(0,1).ToUpper() + $t.Substring(1)
    $count = ([regex]::Matches($envLs, "\s+$cap\s+\d")).Count
    Write-Host ("  - {0,-12} : {1} vars" -f $cap, $count) -ForegroundColor DarkGray
}

if ($EnvOnly) {
    Ok "-EnvOnly: skipping deploy. Done."
    exit 0
}

# ---- deploy -----------------------------------------------------------------
if ($Prod) {
    Warn "deploying to PRODUCTION (will use Production env vars)"
    Invoke-Vercel 'deploy' '--prod' '--yes'
} else {
    Say "building & deploying to PREVIEW (will use Preview env vars)"
    Invoke-Vercel 'deploy' '--yes'
}

if ($LASTEXITCODE -ne 0) { Die "vercel deploy failed (exit $LASTEXITCODE)" }
Ok "done. Check the URL printed above."
