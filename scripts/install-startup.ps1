# 开机自启（可选）
#
# 注册一个计划任务，登录时自动启动管理器。
# 管理器只负责"看板和启停入口"，不会自动启动被管项目——启动仍是显式动作。
#
# 用法（PowerShell，管理员或普通用户均可，任务只对当前用户生效）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1
#
# 卸载：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-startup.ps1 -Uninstall

param(
    [switch]$Uninstall,
    [string]$TaskName = "github-project-initiator"
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodeExe) {
    Write-Host "[ERROR] 找不到 node.exe，请先安装 Node.js 并加入 PATH。" -ForegroundColor Red
    exit 1
}

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[OK] 已移除计划任务：$TaskName" -ForegroundColor Green
    exit 0
}

# 动作：隐藏窗口启动，避免登录时弹出黑框
$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "src\index.js" -WorkingDirectory $Root

# 触发器：登录时
$Trigger = New-ScheduledTaskTrigger -AtLogOn

# 设置：隐藏窗口 + 失败不无限重启
$Settings = New-ScheduledTaskSettingsSet `
    -Hidden `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "本地 GitHub 项目统一管理服务（看板 + 启停 + 更新）" `
    -Force | Out-Null

Write-Host "[OK] 已注册开机自启：$TaskName" -ForegroundColor Green
Write-Host "     工作目录: $Root"
Write-Host "     启动后访问: http://127.0.0.1:8780"
Write-Host ""
Write-Host "     手动移除: powershell -File scripts\install-startup.ps1 -Uninstall"
