# v2 runtime

> Part of [[engineering/index]]

## MCP Lifecycle Methods
- `company.intent.capture`
- `initiative.propose | shape | plan | execute`
- `discussion.open | answer | escalate | resolve`
- `decision.record | resolve | list_pending`
- `briefing.generate | publish`
- `workflow.tick | seed_backlog | watch_ping | update_plan | mark_merged`
- `workflow.autopilot.start | state | stop`
- `lab.state.get | lab.catalog.search | lab.assignment.set | lab.assignment.clear`

## Execution Policy
- `initiative.execute` enforces assignment-aware actor routing from `brian/org/agent-lab.md`.
- Initiative records persist execution policy evidence:
  - `execution_policy_enforced`
  - `execution_actor`
  - `execution_assignment_count`
  - `execution_missing_kinds_json`
  - `## Execution Policy` log section.

## Catalog Curation
- Agent Lab catalog search uses scored ranking signals:
  - repository stars
  - recency/freshness
  - query token hits
- Archived/disabled/fork repositories are filtered out of suggested assignments.

## Event Envelope
`{ id, at, actor, layer, stage, kind, initiativeId?, discussionId?, message, refs[] }`

## UI Surfaces
- CEO Mission: director-level decisions, escalations, initiative pipeline, record explorer.
- Mission Control: squad-level queue, blockers, verification gate, worktree merges.
- Tribe tab: triage escalations and shape initiatives through early lifecycle stages.
