<#
Read-only smoke check for a Slipgates public site. Makes GET requests only.
Usage: pwsh scripts/smoke.ps1 [-Site slipgates.com] [-Paths /,/download/,/docs/,/privacy/]
Exit code 0 = all checks passed, 1 = at least one failed.
#>
param(
    [string]$Site = 'slipgates.com',
    [string[]]$Paths = @('/', '/download/', '/docs/', '/privacy/'),
    [string]$WwwSite = ''
)

$ErrorActionPreference = 'Stop'
$failed = 0

function Check([string]$Name, [bool]$Ok, [string]$Detail = '') {
    if ($Ok) { Write-Host "PASS  $Name" } else { Write-Host "FAIL  $Name  $Detail"; $script:failed++ }
}

function Get-Raw([string]$Url) {
    try {
        Invoke-WebRequest -Uri $Url -MaximumRedirection 0 -SkipHttpErrorCheck -UseBasicParsing -TimeoutSec 20
    } catch {
        $null
    }
}

function Test-Redirect($Response, [string]$Target) {
    $loc = if ($Response) { [string]$Response.Headers['Location'] } else { '' }
    [bool]($Response -and $Response.StatusCode -in 301, 302, 307, 308 -and $loc -like "https://$Target*")
}

# Plain HTTP must redirect to HTTPS on the same host.
$r = Get-Raw "http://$Site/"
Check "http://$Site/ redirects to https" (Test-Redirect $r $Site) "status=$($r.StatusCode)"

# www must redirect to the apex site.
if ($WwwSite -eq '' -and $Site -notmatch '^(www|status|roadmap|app|relay)\.') { $WwwSite = "www.$Site" }
if ($WwwSite) {
    $r = Get-Raw "https://$WwwSite/"
    Check "https://$WwwSite/ redirects to $Site" (Test-Redirect $r $Site) "status=$($r.StatusCode)"
}

foreach ($p in $Paths) {
    $url = "https://$Site$p"
    $r = Get-Raw $url
    $ok = [bool]($r -and $r.StatusCode -eq 200)
    Check "$url returns 200" $ok "status=$($r.StatusCode)"
    if (-not $ok) { continue }
    $body = [string]$r.Content
    Check "$url has no token-shaped strings" ($body -notmatch '(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{10,}') 'token-like text found'
    Check "$url has no IPv4 addresses" ($body -notmatch '(?<![\d.])(\d{1,3}\.){3}\d{1,3}(?![\d.])') 'IPv4-like text found'
}

if ($failed -gt 0) { Write-Host "$failed check(s) failed"; exit 1 }
Write-Host 'All checks passed'
