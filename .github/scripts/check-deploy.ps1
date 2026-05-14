# check-deploy.ps1
# Pollt die GitHub Actions API bis beide Deploy-Workflows fuer den letzten Commit abgeschlossen sind.
# Usage: pwsh -File .github/scripts/check-deploy.ps1 [-Sha <sha>] [-TimeoutSec <n>]

param(
    [string]$Sha = "",
    [int]$TimeoutSec = 300
)

$repo = "Moonmancer/AlchemyHelper"
$apiBase = "https://api.github.com/repos/$repo/actions/runs"

if (-not $Sha) {
    $Sha = (git rev-parse HEAD 2>$null).Trim()
}

if (-not $Sha) {
    Write-Host "FEHLER: Kein SHA ermittelt." -ForegroundColor Red
    exit 1
}

$shortSha = $Sha.Substring(0, [Math]::Min(7, $Sha.Length))
Write-Host "Deploy-Check fuer $shortSha ..." -ForegroundColor Cyan

$watchNames = @(
    "Deploy static content to Pages",
    "pages build and deployment"
)

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$pollInterval = 8

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds $pollInterval

    try {
        $response = Invoke-RestMethod -Uri "${apiBase}?per_page=10" -Headers @{ "User-Agent" = "check-deploy-ps1" } -ErrorAction Stop
    } catch {
        Write-Host "  API-Fehler: $_" -ForegroundColor Yellow
        continue
    }

    $relevant = $response.workflow_runs | Where-Object { $_.head_sha -eq $Sha }

    $results = @{}
    foreach ($run in $relevant) {
        if ($watchNames -contains $run.name) {
            $results[$run.name] = @{ status = $run.status; conclusion = $run.conclusion }
        }
    }

    $allDone = $true
    $anyFailed = $false

    foreach ($name in $watchNames) {
        if ($results.ContainsKey($name)) {
            $r = $results[$name]
            if ($r.status -ne "completed") {
                $allDone = $false
            } elseif ($r.conclusion -ne "success") {
                $anyFailed = $true
            }
        } else {
            $allDone = $false
        }
    }

    if ($allDone) {
        Write-Host ""
        foreach ($name in $watchNames) {
            $icon = if ($results[$name].conclusion -eq "success") { "[OK]" } else { "[FAIL]" }
            $color = if ($results[$name].conclusion -eq "success") { "Green" } else { "Red" }
            Write-Host "  $icon $name -> $($results[$name].conclusion)" -ForegroundColor $color
        }
        if ($anyFailed) { exit 1 } else { exit 0 }
    }

    Write-Host "  ... warte ($([int]((Get-Date) - ($deadline.AddSeconds(-$TimeoutSec))).TotalSeconds)s)" -ForegroundColor Gray
}

Write-Host "TIMEOUT: Workflows nicht innerhalb von ${TimeoutSec}s abgeschlossen." -ForegroundColor Red
exit 2
