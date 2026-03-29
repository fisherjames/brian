# workflow

> Part of [[operations/index]]

## Canonical Operator Flow
1. Verify viewer and MCP connection (`brian --port 3010`, then open `/brains`).
2. In CEO Mission, capture intent and start guided initiative.
3. Resolve explicit decision and escalation questions via confirm or deny.
4. For escalations that need nuance, use threaded responses before final confirm/deny.
5. Use the Tribe tab for shaping/escalation triage.
6. Use Mission Control for squad execution, verification, and merge queue.
7. Generate and publish briefing after meaningful progress.
8. Update `[[execution-plan]]` and handoff note before ending the session.
9. Use CEO `Agent Lab` to load popular external repos for skills/rules/souls, then assign experiments to specialists.
10. Use `Start Autopilot (Safe)` only when pending decisions/escalations are clear.

## Required Delivery Hygiene
- Feature-length commits.
- Commit message includes breaking-change callout when relevant.
- Before/after image reference for user-visible UI changes when feasible.
- Human verification is mandatory before merge and must reference the exact feature/worktree item being approved.
- External skills/rules/souls should be sourced dynamically from GitHub catalogs, not hardcoded local prompt text.
- Execution must persist assignment policy metadata on initiative notes (`Execution Policy` section).
- Decision records must be either:
  - explicit yes/no questions, or
  - multiple-choice questions with declared options (A/B/C...).
