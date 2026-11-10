# Update the shared openviking pip package (openviking-server + vikingbot) safely.
#
# Both console scripts ship in the same wheel, so an upgrade must release both
# exes first: a running process locks its exe and pip fails with WinError 32
# after already removing the package files. This script owns the whole
# lifecycle: stop both -> pip install -U --user -> start OpenViking, which
# spawns and owns the VikingBot gateway itself (--with-bot).
#
# Usage (see data/registry.json):
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\update-openviking.ps1 `
#     -Python <python.exe> -Root <openviking dir> -Scripts <user scripts dir>
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 files without a BOM
# using the ANSI code page, so non-ASCII text breaks the parser.

param(
    [Parameter(Mandatory = $true)][string]$Python,
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Scripts
)

$ErrorActionPreference = 'Continue'

# Stop both services. Run taskkill through cmd.exe and swallow its output:
# PowerShell 5.1 turns native stderr into a NativeCommandError, and a Session 0
# / protected leftover cannot be killed by this user anyway. Such leftovers do
# not lock the user-level scripts pip writes, so the upgrade can proceed.
cmd /c "taskkill /F /IM openviking-server.exe >nul 2>&1"
cmd /c "taskkill /F /IM vikingbot.exe >nul 2>&1"
Start-Sleep -Seconds 2

& $Python -m pip install -U --user openviking
$pipExit = $LASTEXITCODE

# Restart OpenViking in --with-bot mode: the server spawns and owns the
# VikingBot gateway (port 18791) and enables the WebUI Bot API proxy.
# UTF-8 mode is required: the bot prints Unicode (checkmarks) and the default
# GBK console/file encoding makes it exit with UnicodeEncodeError.
# Best effort even when pip failed, so a failed upgrade does not leave both down.
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
Start-Process -FilePath (Join-Path $Scripts 'openviking-server.exe') `
    -ArgumentList '--with-bot', '--bot-port', '18791' `
    -WorkingDirectory $Root -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(180)
$open = $false
while ((Get-Date) -lt $deadline) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', 1933)
        $client.Close()
        $open = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $open) {
    Write-Error 'OpenViking server did not open port 1933 within 180s after upgrade.'
    exit 1
}

exit $pipExit
