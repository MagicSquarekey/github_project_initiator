' Manager-side windowless launcher for AutoTestHub.
'
' Mirrors the orchestration of <root>\start.vbs (stop.bat cleanup -> backend
' -> frontend) but NEVER opens a browser and never shows a MsgBox -- both
' are wrong for headless starts from the manager dashboard.
'
' Usage (see data/registry.json):
'   wscript.exe scripts\start-autotesthub-hidden.vbs <projectRoot>
'
' ASCII-only on purpose: .vbs files are read using the system ANSI code
' page, so non-ASCII text breaks the parser.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count < 1 Then WScript.Quit 1
root = WScript.Arguments(0)

backendDir = root & "\backend"
frontendDir = root & "\frontend"
pythonExe = root & "\.venv\Scripts\python.exe"

If Not fso.FileExists(pythonExe) Then WScript.Quit 1
If Not fso.FolderExists(backendDir) Then WScript.Quit 1
If Not fso.FolderExists(frontendDir) Then WScript.Quit 1

shell.CurrentDirectory = root

' 0 = hidden window; True = wait for the cleanup to finish
shell.Run "cmd /c """ & root & "\stop.bat""", 0, True

' 0 = hidden window, False = do not wait (services keep running)
shell.Run "cmd /c cd /d """ & backendDir & """ && """ & pythonExe & """ main.py", 0, False
shell.Run "cmd /c cd /d """ & frontendDir & """ && npm run dev", 0, False
