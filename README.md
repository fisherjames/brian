# Brian

Brian is a markdown-first company operating system for software delivery.

## Core Idea
Brian runs work through an explicit organizational ladder. Decisions are resolved at the lowest authorized layer; CEO only sees exceptions.

## Canonical Workflow
`intent -> director discussion -> director decision proposal -> CEO reviews proposal PDF -> CEO approves proposal PDF -> tribe shaping -> squad planning -> execution -> verification -> merge -> briefing`

## Planning Contract (Explicit)
- CEO creates initiative.
- Directors return a proposal package as downloadable PDF.
- CEO reviews proposal PDF in CEO View and either approves or rejects with explicit feedback.
- Rejection must reopen director discussion before a revised proposal can be submitted.
- After CEO approval, tribe shapes; squads then plan and execute.
- Rejection loop (strict): `CEO rejects proposal PDF -> director discussion -> revised director decision proposal -> CEO reviews proposal PDF`.
- `brian plan <initiative-id> --squad "<name>"` starts squad planning discussion and generates a question set.
- Discussion chain is fixed:
  - Team Lead asks Product Owner first.
  - Product Owner answers within authority/context.
  - Unresolved items escalate stepwise: tribe -> director -> CEO.
- Planning is paused only when escalation reaches CEO.
- If escalation does not reach CEO, planning auto-advances directly to execution.
- Proposal PDF download works from mobile and desktop.

## Decision Governance
- Escalation chain is fixed: `squad -> tribe -> director -> ceo`
- Escalation is stepwise; no jumps
- Escalation at one level becomes a decision at the next level
- CEO inbox contains only:
  - fully escalated decisions, or
  - decisions with no inferable outcome and no delegated authority below CEO

## UI Surfaces
- `CEO Mission`: escalated decisions, strategic blockers, briefings
- `Directors`: director decision inbox
- `Tribe`: tribe decision inbox
- `Product Owner View`: squad-context decision inbox
- `Mission Control`: squad execution, verification, merge gates
- `Graph + Notes`: evidence graph and note navigation
- `Agents + Workflow`: editable personas, workflow rules, and skills

Every Mission Control action is backed by a real MCP call so the same workflow surface can be consumed by both UI operators and future executive-agent automation.

## Storage Model
- Repo memory: `brian/`
- Local workspace metadata: `.brian/brain.json`
- Global registry: `~/.brian/brains.json`, `~/.brian/server.json`
- Runtime events: `~/.brian/state/<brainId>/events.ndjson`

## CLI (Canonical)
- `brian intent <text>`
- `brian propose <title>`
- `brian shape <initiative-id>`
- `brian plan <initiative-id> [--squad <name>]`
- `brian mission <initiative-id> [--squad <name>]`
- `brian work`
- `brian verify`
- `brian merge`
- `brian brief`
- `brian decide <initiative-id> <title>`
- `brian status`
- `brian doctrine-lint`

## API (Canonical)
- `GET /api/brains/:id/company-state`
- `GET /api/brains/:id/initiatives`
- `GET /api/brains/:id/discussions`
- `GET /api/brains/:id/decisions`
- `GET /api/brains/:id/briefings`
- `GET /api/brains/:id/worktrees`

## Quick Start
```bash
npm install
npm run build
npm run install:cli
brian --port 3010
```
Open `http://localhost:3010/brains`.

In a project workspace:
```bash
brian init
brian intent "Improve activation"
brian propose "Activation initiative"
brian shape <initiative-id>
brian plan <initiative-id> --squad "Core Squad"
brian mission <initiative-id> --squad "Core Squad"
brian work
brian verify
brian merge
brian brief
```

Final shipping action is in Mission Control: **Ship to Main** (queue dry-run, merge, then push to `origin/main` behind verification/conflict gates).
