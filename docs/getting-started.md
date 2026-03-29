# Getting Started With Brian

## 1. Install

```bash
git clone <your fork url>
cd <your fork directory>
npm install
npm run build
npm run install:cli
```

Verify:

```bash
brian help
```

## 2. Start The Viewer

```bash
brian --port 3010
```

Open [http://localhost:3010/brains](http://localhost:3010/brains).

## 3. Initialize A Repo

```bash
cd /absolute/path/to/project
brian init
```

The wizard asks for:

- name
- description
- preset
- whether to link existing docs
- whether to add package scripts
- whether to install the managed Brian Codex skill pack

For a fully managed setup, choose `codex-team`.

## 4. Start V2 Work

```bash
brian intent "Improve checkout conversion"
brian propose "Checkout conversion initiative"
brian shape initiative-xxxx
brian plan initiative-xxxx
brian work
brian brief
brian decide initiative-xxxx "Approve rollout"
```

This drives the canonical initiative lifecycle.

Or launch with a role directly:

```bash
brian work --role frontend
brian work --role backend
brian work --role product
```

This launches Codex with:

- `AGENTS.md`
- `brian/index.md`
- `brian/execution-plan.md`
- the latest handoff
- the relevant role note

## 5. Use V2 Dashboard Tabs

Open:

- `http://localhost:3010/brains/<brainId>`

In V2 tabs:

- `CEO Mission`:
  - initiatives, decisions, briefings, blockers only
  - use `Start Guided Initiative` for one objective
  - use `Update Plan` to append CEO plan rework into `brian/execution-plan.md`
- `Directors`:
  - resolve pending decisions and escalations with explicit context
  - confirm that yes/no or option-based decisions are answered clearly
- `Tribe`:
  - resolve squad, tribe, and director questions in one place
  - escalate through org layers up to CEO decisions
  - advance lifecycle staging when shaping is ready
- `Mission Control`:
  - run execution queue, review blockers, verify, and merge safely
  - use `Generate Handoff` to write an explicit handoff checkpoint any time
- `Agents + Workflow`:
  - edit real Codex skill files under `~/.codex/skills/*/SKILL.md`
  - edit agent markdown by persona
  - edit shared rules markdown in one place

In Mission Control:

- `Start Next Work` marks the selected `NEXT:` item and auto-creates a paired `MERGE:` queue item with branch/image/breaking metadata.
- `Dry Run Queue` validates merge metadata, verification status, and conflict risk before any merge.
- every run completion writes a new handoff in `brian/handoffs/` and pushes it to the live Handoffs panel.
- `Start Observer` auto-seeds a 3-pack backlog (`incremental`, `dream_feature`, `refactor`) when queue is empty.

Workflow contract in practice:
- `intent -> proposal -> leadership discussion -> director decision -> tribe shaping -> squad planning -> execution -> verification -> merge -> briefing`
- `hard_blocker` halts progression.
- `advisory` is visible but does not halt progression.

## 6. End Work

```bash
brian end
```

Or with a role:

```bash
brian end --role backend
```

This creates the next handoff and launches Codex with the managed wrap-up prompt.

## 7. Migrate An Older Repo

If a repo still has an older layout:

```bash
brian migrate
```

After migration, Brian operates on `brian/` plus `.brian/`.

## 8. Team And Parallel Work

For multi-role work:

- split tasks first
- assign owners and paths
- record dependencies and merge order
- mirror that state into `brian/commands/team-board.md`
- keep each worker in its own branch or worktree

Brian improves coordination and visibility. It does not remove the need for good task boundaries.

Compatibility notes:
- Legacy commands still run as aliases during migration.
- Canonical command set is: `intent`, `propose`, `shape`, `plan`, `work`, `brief`, `decide`, `status`, `doctrine-lint`.
