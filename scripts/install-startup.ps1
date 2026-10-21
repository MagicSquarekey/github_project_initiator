# Autostart (optional)
#
# Starts the manager hidden when the current user logs on, via the
# HKCU Run key. Deliberately NOT a Scheduled Task: creating a logon
# task requires administrator rights, while an HKCU Run entry does not.
# The actual launch is done by start-manager-hidden.vbs (windowless).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1
# Uninstall:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1 -Uninstall
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 files without a
# BOM using the ANSI code page, so non-ASCII text breaks the parser.

param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Vbs = Join-Path $PSScriptRoot "start-manager-hidden.vbs"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$ValueName = "github_project_initiator"

if ($Uninstall) {
    Remove-ItemProperty -Path $RunKey -Name $ValueName -ErrorAction SilentlyContinue
    Write-Host "[OK] Autostart removed ($ValueName)" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $Vbs)) {
    Write-Host "[ERROR] Missing $Vbs" -ForegroundColor Red
    exit 1
}

$Command = "wscript.exe `"$Vbs`""
Set-ItemProperty -Path $RunKey -Name $ValueName -Value $Command

Write-Host "[OK] Autostart registered (hidden start at user logon)" -ForegroundColor Green
Write-Host "     Registry : $RunKey"
Write-Host "     Value    : $ValueName = $Command"
Write-Host "     Manager  : $Root (node src/index.js)"
Write-Host ""
Write-Host "     Uninstall: powershell -File scripts\install-startup.ps1 -Uninstall"
