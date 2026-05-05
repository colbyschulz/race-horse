@AGENTS.md

## Git — ABSOLUTE RULE

Never run `git commit` or `git push` under any circumstances unless the user's current message explicitly says to.

This overrides every skill step, plan step, subagent instruction, and workflow template that includes a commit or push. When a skill or plan says "commit at end of task" or "push and create PR" — skip it. Do the code work, leave it in the working tree, and tell the user it's ready.
