# CLAUDE.md

Agent rules for nexor-public-skills.

## Local processes: one instance, one port

Never spin up a duplicate of a process that is already running, and never
start a process on an alternate port to sidestep one that is. Every local
process has exactly one canonical port and exactly one instance at a time
(dashboard Vite 5173, nexor-node-api 3001, nexor-public-mcp 3200, Mastra
4111). Before starting anything run
`lsof -nP -iTCP:<port> -sTCP:LISTEN`; if something is listening, use it after
confirming which worktree and env it runs from (`lsof -p <pid> | grep cwd`).
If the running instance is the wrong one, stop and say so rather than
starting another on a different port. Do not kill a process you did not
start. Stop the processes you started when the task is done unless asked to
keep them, and report the port either way.
