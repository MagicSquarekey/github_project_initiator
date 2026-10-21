' github_project_initiator - hidden autostart launcher
'
' Starts the manager (node src/index.js) with no visible window.
' Used by the per-user autostart entry (HKCU Run key); see
' scripts/install-startup.ps1. ASCII-only on purpose: .vbs files are
' read using the system ANSI code page, so non-ASCII text breaks the parser.
'
' The manager root is resolved from this script's own location
' (this file lives in <root>\scripts\), so the launcher stays portable.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = root

' 0 = hidden window, False = do not wait for the manager to exit
shell.Run "cmd /c node src\index.js", 0, False
