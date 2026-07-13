# Quantum-Chat

## Superpowers

This project ships with the [Superpowers](https://github.com/obra/superpowers) skill library (v6.1.1) in `.claude/skills/`.

At the start of every conversation, read and follow `.claude/skills/using-superpowers/SKILL.md`. It establishes the rule: before responding to any task — including clarifying questions — check whether one of the skills below applies and invoke it if there is even a small chance it does.

Available skills:

- `brainstorming` — refine an idea into a validated design before writing code ("let's build X" starts here)
- `writing-plans` — turn a validated design into a step-by-step implementation plan
- `executing-plans` — work through a written plan task by task
- `subagent-driven-development` — dispatch subagents to execute plan tasks with review between steps
- `test-driven-development` — red/green TDD discipline for all implementation work
- `systematic-debugging` — root-cause analysis process ("fix this bug" starts here)
- `verification-before-completion` — verify work actually functions before claiming it's done
- `requesting-code-review` / `receiving-code-review` — code review workflows
- `finishing-a-development-branch` — merge/PR/cleanup workflow when work on a branch is complete
- `using-git-worktrees` — isolated workspaces for parallel work
- `dispatching-parallel-agents` — coordinate concurrent subagents
- `writing-skills` — create or edit skills themselves
