' 出奇快照中继隐藏启动器(计划任务 FootballCqRelay 用)
' 2026-10-20 起含盘路中继; 2026-11-10 改为单子进程串行(cq-relay-all.bat),
' 原因: 双 Run 方案下第二个 Run 在任务实例结束后常不执行, 盘路快照 09:08 后断档。
Dim fso, dir
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("Wscript.Shell").Run "cmd /c """ & dir & "\cq-relay-all.bat""", 0, True
