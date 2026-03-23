# Brian For Codex

Brian is a Codex-first repo memory layer built from:

- markdown notes inside the repository
- a local viewer
- a small CLI

Use `brian` as the primary command. `brain-tree-os` still works as a compatibility alias.

## Command Split

Codex slash commands handle conversation behavior:

- `/init`
- `/plan`
- `/resume`
- `/status`

Brian shell commands handle project-memory behavior:

- `brian init`
- `brian resume`
- `brian wrap-up`
- `brian status`
- `brian notes`
- `brian plan`
- `brian sprint`
- `brian sync`
- `brian feature`
- `brian migrate`

These are complementary, not duplicates.

## Default Repo Layout

```text
AGENTS.md
.brian/brain.json
brian/
  index.md
  execution-plan.md
  product/
  engineering/
  operations/
  commands/
  agents/
  handoffs/
  templates/
  assets/
```

Brian also reads the older BrainTree layout for compatibility.

## Start A Session

```bash
brian resume
codex
```

Read the files printed by `brian resume`, then follow `AGENTS.md`.

## End A Session

```bash
brian wrap-up
```

Then ask Codex to:

- fill the newest handoff
- update the relevant brian notes
- update `brian/execution-plan.md` if progress changed

## Honest Limit

Codex skills help with behavior and specialization. They do not provide a native transport for injecting text into an already-open live Codex thread.

That means:
- a skill can decide how wrap-up should work
- a shell command can launch Codex with a wrap-up prompt
- neither can silently post a new prompt into the exact live thread you already have open

Brian therefore does not pretend to offer a hook or live-thread injection feature that Codex does not document.

## When To Use Repo-Local Workflow Layers

Keep Brian core generic.

If a project wants richer flows such as:
- `pnpm brain:start`
- team planning
- worktree fan-out
- role-specific skills
- review or merge orchestration

add those in the managed repo, then mirror status back into `brian/commands/team-board.md` so the viewer can show progress.
