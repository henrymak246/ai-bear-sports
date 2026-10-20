' 出奇快照中继隐藏启动器(计划任务 FootballCqRelay 用; Run 不经 shell, 重定向须 cmd /c 包装)
' 2026-10-20 起加盘路中继: 比分快照(_cq_relay.js) + 盘口快照(_cq_odds_relay.js) 顺序跑, 各自独立日志, 互不影响
Dim fso, dir
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("Wscript.Shell").Run "cmd /c node """ & dir & "\_cq_relay.js"" >> """ & dir & "\_cq_relay.log"" 2>&1", 0, True
CreateObject("Wscript.Shell").Run "cmd /c node """ & dir & "\_cq_odds_relay.js"" >> """ & dir & "\_cq_odds_relay.log"" 2>&1", 0, False
