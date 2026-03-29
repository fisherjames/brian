# Brian

<p align="center">
  <img src="packages/web/public/logo.svg" alt="Brian" width="180" />
</p>

Brian is a markdown-first AI operating system for running software delivery like a visible company.

## Vision
Brian should feel like a company that thinks in markdown.

Core intent:
- Strategy, discussion, decisions, and execution are visible.
- Human approvals happen at explicit gates.
- Delivery state is auditable in repo notes and local event logs.
- CEO can steer work from the viewer without digging through raw agent noise.

## Philosophy
Brian V2 operates on these non-negotiable rules:
- `intent -> proposal -> leadership discussion -> director decision -> tribe shaping -> squad planning -> execution -> verification -> merge -> briefing`
- No execution without context.
- No unresolved discussion without escalation.
- Every meaningful interaction emits one of: `answer | decision | task | risk | escalation`.
- Merge requires verification evidence.

## Current Product Surfaces
- `CEO Mission` (executive control):
  - initiatives, decisions, briefings, blockers only (noise-free CEO view)
- `Directors`:
  - decision inbox + escalation context and resolution actions
- `Tribe` (cross-initiative direction):
  - shaping, prioritization, and escalation routing between squad and directors
- `Mission Control` (squad-level orchestration):
  - current task, queue, blockers, live output
  - verification gate
  - worktree queue, preview, merge actions
- `Agents + Workflow`:
  - agent markdown editor by persona
  - editable Codex skill files (`~/.codex/skills/*/SKILL.md`)
  - editable Brian workflow rules (`brian/org/rules.md`)
- `Graph + Notes`:
  - graph navigation + markdown notes with clickable records from CEO and Directors views

## Storage Model
- Repo-visible memory: `brian/`
- Repo-local metadata: `.brian/brain.json`
- Global registry/runtime config: `~/.brian/brains.json`, `~/.brian/server.json`
- Runtime event log: `~/.brian/state/<brainId>/events.ndjson`

## Key Features (Implemented)
- V2 lifecycle APIs under `/api/v2/brains/:id/*`.
- MCP-backed viewer actions (`/ws` team channel) for mission operations.
- Explicit question/outcome model for decisions/escalations (`confirmed`/`denied`).
- Dynamic Agent Lab:
  - `lab.catalog.search`
  - `lab.assignment.set`
  - `lab.assignment.clear`
  - scored catalog signals (stars + freshness + query hits)
  - assignment state in `brian/org/agent-lab.md`
- Execution-policy enforcement on `initiative.execute`:
  - assignment-aware actor routing
  - policy metadata persisted in initiative notes (`Execution Policy` section + frontmatter fields)
- Plan rework from CEO tab:
  - `workflow.update_plan` appends structured `CEO Plan Rework` entries to `brian/execution-plan.md`.
- Guided initiative objective defaults from next open execution-plan step.
- Safe autopilot lifecycle:
  - `workflow.autopilot.start | state | stop`
  - governance-safe blocking when unresolved decisions/escalations exist.

## Vision vs Reality (Delta)
This section is the explicit gap tracker between intended product and current build.

What matches vision now:
- Markdown remains source of truth for company memory.
- Decisions/escalations are explicit and actionable.
- CEO/Tribe/Squad split exists in UI.
- Human verification and merge gating are modeled in Mission Control.

Where we are still short:
- Full unattended overnight delivery is still intentionally constrained by governance gates; human steering/verification remains required before merge.

## Getting Started

### 1) Install
```bash
git clone <your-fork-or-origin-url>
cd brian
npm install
npm run build
npm run install:cli
```

### 2) Start Viewer
```bash
brian --port 3010
```
Open:
- `http://localhost:3010/brains`

### 3) Initialize or Register a Brain
Inside a target repo:
```bash
brian init
brian status
```

### 4) Run the V2 Lifecycle
```bash
brian intent "Improve activation for new users"
brian propose "Activation improvement initiative"
brian shape <initiative-id>
brian plan <initiative-id>
brian work
brian brief
brian decide <initiative-id> "Approve rollout"
```

### 5) Use Viewer Mission Tabs
- `CEO Mission`: monitor initiatives, decisions, briefings, blockers.
- `Directors`: approve/deny decisions and resolve escalations with explicit context.
- `Tribe`: resolve and escalate questions across squad, tribe, and director.
- `Mission Control`: execute queue, verify, merge safely.
- `Agents + Workflow`: edit agents, skills, and rules in one place.
- `Graph + Notes`: inspect linked initiative/discussion/decision/briefing records.

### 6) Experiment with Agent Lab
In `CEO Mission`:
- choose `skill`, `rule`, or `soul`
- search popular repos
- assign to a specialist
- track assignments in `brian/org/agent-lab.md`

## CLI Commands (Practical Set)
- `brian` start viewer
- `brian init` scaffold/register workspace
- `brian status` list active/registered brains
- `brian intent <text>` capture intent
- `brian propose <title>` create proposal-stage initiative
- `brian shape <initiative-id>` move to tribe shaping
- `brian plan <initiative-id>` move to squad planning
- `brian work` run implementation loop
- `brian brief` generate briefing
- `brian decide <initiative-id> <title>` record director decision
- `brian end` wrap the current session with handoff update
- `brian doctrine-lint` validate workflow integrity

Compatibility aliases still exist for migration, but canonical commands above are the only promoted workflow.

## Single-Page Operating Model
Use this as the day-to-day contract:
- `CEO Mission`: decide priorities and clear blockers that require executive intent.
- `Directors`: resolve pending decisions/escalations with explicit question context.
- `Tribe`: shape initiative direction and escalate only unresolved cross-cutting questions.
- `Mission Control`: run one queue item at a time, record verification, then merge worktree.
- `Graph + Notes`: inspect evidence and rationale records.
- `Agents + Workflow`: tune personas, skills, and rules when output quality drops.

Definition of done per initiative:
- Discussion question resolved or escalated with record.
- Decision recorded and resolved.
- Verification captured before merge.
- Worktree merged conflict-free.
- Briefing generated with rationale and status.

## Repository Layout
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
    ├── org/
    ├── initiatives/
    ├── discussions/
    ├── decisions/
    ├── briefings/
    ├── tasks/
    └── handoffs/
```

## Verification Checklist
Use this to assess whether reality matches expectations after pull/build:
- Viewer loads `/brains` and a brain detail page.
- CEO Mission shows pending decision/escalation cards with explicit questions.
- `Update Plan` writes to `brian/execution-plan.md`.
- Mission Control shows actionable queue/blockers/worktrees.
- Tribe tab can respond/confirm/deny/escalate questions across squad/tribe/director.
- Agents + Workflow can edit real Codex skills and Brian rules.

## Release Readiness Scorecard
Use this before shipping. Mark each item `Pass` or `Fail`.

| Area | Gate | Pass Criteria | Status |
|---|---|---|---|
| Viewer Runtime | App availability | `/brains` and `/brains/:id` load without module/chunk errors | ⬜ |
| CEO Mission | Decision quality | Every pending decision/escalation shows an explicit question; confirm/deny works | ⬜ |
| CEO Mission | Plan control | `Update Plan` appends a valid `CEO Plan Rework` section to `brian/execution-plan.md` | ⬜ |
| Tribe | Governance flow | Escalations can be responded/confirmed/denied/escalated with explicit context | ⬜ |
| Mission Control | Execution flow | Start next work, queue movement, blockers, and current task update correctly | ⬜ |
| Mission Control | Merge safety | Merge action blocked until verification and conflict-free state; dry-run reflects reality | ⬜ |
| Agents + Workflow | Skill/rule editing | Skill edits persist to `~/.codex/skills/*/SKILL.md`; rules persist to `brian/org/rules.md` | ⬜ |
| Data Integrity | Notes + links | V2 notes are present, no placeholder sections, key wikilinks resolve | ⬜ |
| Build Health | Compile + types | `npm run -s typecheck` and `npm run -s build` both succeed | ⬜ |
| Delivery Evidence | Change validation | UI-impacting changes include before/after image references when feasible | ⬜ |

## Docs
- [Getting started](docs/getting-started.md)
- [Codex workflow](docs/codex.md)
