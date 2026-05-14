# One-shot script to add SUPABASE_SERVICE_ROLE_KEY to .env.local without
# fighting VS Code paste-formatting. Asks for the key as hidden input,
# strips any whitespace/newlines that snuck in, appends to .env.local.
#
# Usage:  cd C:\Users\Algernon\freejobpost
#         .\scripts\set-supabase-service-key.ps1
#
# Safe to re-run: removes any existing SUPABASE_SERVICE_ROLE_KEY line first.

param()
$ErrorActionPreference = 'Stop'

# Make sure we're in the freejobpost dir
$repoFile = Join-Path -Path $PSScriptRoot -ChildPath '..\package.json'
if (-not (Test-Path $repoFile)) {
  Write-Host "Run this from C:\Users\Algernon\freejobpost" -ForegroundColor Red
  exit 1
}
Set-Location (Resolve-Path (Join-Path -Path $PSScriptRoot -ChildPath '..'))

Write-Host "Paste the Supabase service_role key (input hidden, hit Enter when done):" -ForegroundColor Cyan
$secure = Read-Host -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $secure).Password

# Defensive cleanup: strip any whitespace, newlines, quotes that might have
# come through from clipboard / editor mangling. Service-role keys never
# contain whitespace, so any of these are bugs.
$plain = $plain -replace '\s', '' -replace "^[`"']|[`"']$", ''

if ($plain.Length -lt 30) {
  Write-Host "That doesn't look like a real key (length $($plain.Length)). Aborting." -ForegroundColor Red
  exit 1
}

# Remove any existing SUPABASE_SERVICE_ROLE_KEY= line so we don't double-add
if (Test-Path .env.local) {
  $existing = Get-Content .env.local | Where-Object { $_ -notmatch '^SUPABASE_SERVICE_ROLE_KEY=' }
  Set-Content -Path .env.local -Value $existing -Encoding utf8
}

# Append the fresh key
Add-Content -Path .env.local -Value "SUPABASE_SERVICE_ROLE_KEY=$plain" -Encoding utf8

# Print sanity-check (length + format hint, never the key)
$prefix = $plain.Substring(0, [Math]::Min(12, $plain.Length))
Write-Host ""
Write-Host "Saved." -ForegroundColor Green
Write-Host "  File: $(Resolve-Path .env.local)"
Write-Host "  Length: $($plain.Length)"
Write-Host "  Starts with: $prefix..."
if ($plain.StartsWith('sb_secret_')) {
  Write-Host "  Format: new (sb_secret_...) — good" -ForegroundColor Green
} elseif ($plain.StartsWith('eyJ')) {
  Write-Host "  Format: legacy JWT (eyJ...) — should work but new sb_secret_... is preferred" -ForegroundColor Yellow
} else {
  Write-Host "  Format: UNKNOWN — this might not be the right key" -ForegroundColor Yellow
}
