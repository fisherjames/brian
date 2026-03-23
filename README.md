# Brian

<p align="center">
  <img src="packages/web/public/logo.svg" alt="Brian" width="180" />
</p>

Brian is a Codex-first project memory layer: a local viewer, a repository scaffold, and a small CLI for keeping AI-readable project context in the repo instead of only in chat history.

The new default layout is:

```text
repo/
├── AGENTS.md
├── .brian/
│   └── brain.json
└── brian/
    ├── index.md
    ├── execution-plan.md
    ├── product/
    ├── engineering/
    ├── operations/
    ├── commands/
    ├── agents/
    ├── handoffs/
    ├── templates/
    └── assets/
```

Legacy BrainTree repos still work. Brian reads both the new `brian/` + `.brian/` layout and the older root-level BrainTree layout.

## Install

```bash
git clone https://github.com/fisherjames/brain-tree-os.git
cd brain-tree-os
npm install
npm run build
npm run install:cli
```

That links both commands globally:

```bash
brian
brain-tree-os
```

`brain-tree-os` remains a compatibility alias. New docs and scaffolds use `brian`.

## Quick Start

1. Start the viewer:

```bash
brian --port 3010
```

2. In an existing project:

```bash
cd /path/to/project
brian init
```

3. Then resume and open Codex:

```bash
brian resume
codex
```

4. For older repos, migrate the layout when you are ready:

```bash
brian migrate
```

The viewer will show:
- the note graph
- file tree
- execution-plan progress
- team-board progress if the repo mirrors orchestration state into `brian/commands/team-board.md`
- handoff history

## Commands

- `brian` starts the local viewer.
- `brian init` scaffolds a new Brian workspace in the current repo.
- `brian resume` prints the canonical files to read at session start.
- `brian wrap-up` creates the next handoff template.
- `brian status` shows the active brain or all registered brains.
- `brian notes "<scope>"` runs a Codex note-reconciliation pass after top-level note edits.
- `brian plan [step]` creates a linked plan note from the execution plan.
- `brian sprint` creates a sprint note from in-progress and ready work.
- `brian sync` scans for broken wikilinks and missing parent links.
- `brian feature "<name>"` creates a linked feature note.
- `brian codex` prints the Codex/Brian command split.
- `brian migrate` moves a legacy BrainTree repo into the new `brian/` layout.

## Init Wizard

`brian init` now prompts for:

- project name
- description
- preset: `core` or `codex-team`
- whether to link existing markdown docs
- whether to add `package.json` helper scripts

The `codex-team` preset also scaffolds:

- `brian/commands/`
- `brian/commands/team-board.md`
- richer role notes in `brian/agents/`
- optional repo-local `brain:*` helper scripts

## Codex Workflow

Brian and Codex have different responsibilities:

- Codex native slash commands manage the current conversation.
- Brian shell commands manage the repo memory layer.

Typical session flow:

```bash
brian resume
codex
```

Then inside Codex:
- read the files printed by `brian resume`
- inspect the relevant folder index
- do the task
- update notes when architecture, workflow, or priorities changed

At the end:

```bash
brian wrap-up
```

Then have Codex fill the newest handoff and update `brian/execution-plan.md` if status changed.

Important limit: Brian does not claim fake hook parity. Codex skills are useful for behavior, but they do not inject text into an already-open live Codex session. The supported workflow uses repo files, shell commands, and Codex prompts honestly.

## Docs

- [Getting started](docs/getting-started.md)
- [Codex workflow](docs/codex.md)

## Compatibility

Brian reads and preserves legacy BrainTree repos that still use:

- `.braintree/brain.json`
- `BRAIN-INDEX.md`
- `Execution-Plan.md`
- `01_Product/`
- `02_Engineering/`
- `03_Operations/`
- `Commands/`
- `Agents/`
- `Handoffs/`

Use `brian migrate` when you want to move that structure into the new lowercase layout.
