# Brian

<p align="center">
  <img src="packages/web/public/logo.svg" alt="Brian" width="180" />
</p>

Brian is a fully managed Codex-first project memory system: a viewer, a repo scaffold, a role/employee model, a Codex skill pack, and a small CLI that keeps real project context inside the repository.

## Default Layout

```text
repo/
├── AGENTS.md
├── .brian/
│   └── brain.json
└── brian/
    ├── index.md
    ├── execution-plan.md
    ├── constitution.md
    ├── specs/
    ├── product/
    ├── engineering/
    ├── operations/
    ├── commands/
    ├── agents/
    ├── org/
    ├── initiatives/
    ├── discussions/
    ├── decisions/
    ├── briefings/
    ├── tasks/
    ├── handoffs/
    ├── templates/
    └── assets/
```

## Install

```bash
git clone <your fork url>
cd <your fork directory>
npm install
npm run build
npm run install:cli
```

That installs the `brian` command globally.

## Quick Start

1. Start the viewer:

```bash
brian --port 3010
```

2. In an existing repo:

```bash
cd /path/to/project
brian init
```

3. Run the canonical V2 lifecycle:

```bash
brian intent "Improve onboarding conversion"
brian propose "Onboarding conversion initiative"
brian shape initiative-xxxx
brian plan initiative-xxxx
brian work
brian brief
brian decide initiative-xxxx "Approve rollout to 25%"
```

4. Compatibility flow for legacy execution-plan/team-board:

```bash
brian mission "Feature Name"
```

5. End a managed Codex session:

```bash
brian end
```

## Managed Experience

`brian init --preset codex-team` now handles more than note scaffolding:

- creates the Brian note structure
- installs a managed Codex skill pack into `~/.codex/skills/`
- scaffolds role notes under `brian/agents/`
- scaffolds command loops under `brian/commands/`
- can add `package.json` helper scripts
- links existing markdown docs into `brian/operations/existing-docs.md`

The installed skill pack includes:

- `brian-core`
- `brian-founder-ceo`
- `brian-product-lead`
- `brian-growth-marketing`
- `brian-frontend-engineer`
- `brian-backend-engineer`
- `brian-mobile-engineer`
- `brian-devops-release`
- `brian-team-orchestrator`

## Commands

- `brian` starts the viewer
- `brian intent "<text>"` captures initiative intent (V2)
- `brian propose "<name>"` creates proposal-stage initiative (V2)
- `brian shape <initiative-id>` moves initiative to shaping stage (V2)
- `brian plan <initiative-id>` plans initiative execution (V2)
- `brian brief` generates a director briefing (V2)
- `brian decide <initiative-id> "<title>"` records a director decision (V2)
- `brian doctrine-lint` validates governance and pipeline hygiene (V2)
- `brian next` shows one recommended next command
- `brian work [--role <role>]` launches Codex with the managed start prompt
- `brian end [--role <role>]` creates the handoff and launches the managed wrap-up prompt
- `brian status` shows the active brain or all registered brains
- `brian mission "<name>"` creates spec packet + execution/team entries
- `brian init` scaffolds a Brian workspace
- `brian resume` prints the canonical files to read
- `brian wrap-up` creates the next handoff template
- `brian notes "<scope>"` reconciles downstream notes after top-level edits
- `brian migrate` converts an old layout into `brian/` + `.brian/`
- `brian plan [step]` is V2-first; use `EP-*` ids for legacy execution-plan step notes
- `brian sprint` creates a sprint note from ready/in-progress work
- `brian sync` audits links and parent relationships
- `brian spec "<name>"` creates a feature spec packet
- `brian feature "<name>"` aliases to `brian spec`
- `brian codex` prints the Codex/Brian split

## Workflow Philosophy

Brian V2 is initiative-first and decision-first (with spec-kit style discipline):

- start from intent and proposal, not a flat task list
- use discussion and decision records as visible reasoning
- derive execution tasks only after shaping/planning
- keep implementation and operational memory in-repo and link-valid

## V2 Viewer Flag

V2 Director Console is currently parallelized behind a feature flag:

- set `NEXT_PUBLIC_BRIAN_V2=1` before starting the viewer
- or open a brain with `?v2=1`

V1 remains runnable during migration.

## Parallel Work

Brian supports parallel work as a managed pattern, not as fake native subagents.

The safe pattern is:

1. decompose work into explicit tasks with owners, paths, dependencies, verification, and merge order
2. mirror that state into `brian/commands/team-board.md`
3. keep each worker isolated in its own branch or worktree
4. review before merge
5. merge in dependency order
6. end with a handoff and execution-plan update

What Brian helps with:

- role-scoped startup context
- shared task board in the viewer
- explicit ownership and merge ordering in repo notes
- durable handoffs and execution-plan state

What Brian does not eliminate:

- merge conflicts when two tasks still touch the same files
- contract drift when tasks change shared interfaces without an explicit dependency edge
- bad task splitting

The fix is not hidden automation. The fix is better planning:

- assign file/path ownership up front
- call out shared contracts explicitly
- mark task dependencies before coding
- merge high-risk branches earlier

## Important Limitation

Codex skills improve behavior and specialization. They do not inject a prompt into an already-open live Codex thread. Brian therefore uses explicit session commands instead of pretending there is a hidden hook or live-session transport.

## Docs

- [Getting started](docs/getting-started.md)
- [Codex workflow](docs/codex.md)
