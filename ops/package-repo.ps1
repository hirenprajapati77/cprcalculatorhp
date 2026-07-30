<#
.SYNOPSIS
Safely packages the repository for external distribution.

.DESCRIPTION
This script uses `git archive` to create a clean zip of the repository.
It guarantees that untracked and .gitignored files (like .env, .env.server, and node_modules)
are NEVER included in the exported zip, preventing credential leaks.
#>

param (
    [string]$OutputPath = "$HOME\Downloads\cpr-calculator-platform-clean.zip"
)

Write-Host "Packaging repository securely using git archive..."
git archive -o $OutputPath HEAD

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Clean repository exported to $OutputPath" -ForegroundColor Green
} else {
    Write-Host "Failed to package repository." -ForegroundColor Red
    exit 1
}
