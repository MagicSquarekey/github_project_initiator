' Manager-side windowless launcher for githubPopularProjects.
'
' Steps (each run hidden via WScript.Shell.Run with window style 0):
'   1. install dependencies if node_modules is missing
'   2. build if .next/BUILD_ID is missing (e.g. after a dev-mode run
'      overwrote the production build)
'   3. npm start
'
' Why a .vbs: the manager spawns projects with detached:true, and on
' Windows a detached child gets its own console window -- that is the
' popup window users see. WScript.Shell.Run with style 0 keeps the whole
' tree (cmd -> npm -> next) hidden. It also deliberately does NOT fall
' back to `npm run dev`: dev mode overwrites .next with dev artifacts and
' would break the next production start.
'
' Note: steps are separate Run calls on purpose. Chaining them with "&"
' inside one `cmd /c` is unreliable: a false `if` swallows the commands
' after it, so `call npm start` never ran.
'
' Usage (see data/registry.json):
'   wscript.exe scripts\start-gpp-hidden.vbs <projectRoot>
'
' ASCII-only on purpose: .vbs files are read using the system ANSI code
' page, so non-ASCII text breaks the parser.

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count < 1 Then WScript.Quit 1
root = WScript.Arguments(0)
root = Replace(root, "/", "\")
If Not fso.FolderExists(root) Then WScript.Quit 1

shell.CurrentDirectory = root

If Not fso.FolderExists(root & "\node_modules") Then
  shell.Run "cmd /c call npm install", 0, True
End If

If Not fso.FileExists(root & "\.next\BUILD_ID") Then
  shell.Run "cmd /c call npm run build", 0, True
End If

' 0 = hidden window, False = do not wait (server keeps running)
shell.Run "cmd /c call npm start", 0, False
