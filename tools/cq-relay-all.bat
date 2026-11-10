@echo off
rem sequential relay: score snapshot first, then odds snapshot (one child process, no async race)
rem called by start-cq-relay-hidden.vbs (Task Scheduler FootballCqRelay, hourly :08)
setlocal
cd /d "%~dp0"
node "%~dp0_cq_relay.js" >> "%~dp0_cq_relay.log" 2>&1
node "%~dp0_cq_odds_relay.js" >> "%~dp0_cq_odds_relay.log" 2>&1
endlocal
