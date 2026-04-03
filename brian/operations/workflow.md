# workflow

> Part of [[operations/index]]

## Canonical Operator Flow
1. Verify viewer and MCP connection (`brian --port 3010`, then open `/brains`).
2. For live demos, set Mission Control **Live Demo Gate** to ready before automation begins.
3. In CEO Mission, capture intent and start guided initiative.
4. Resolve explicit decision and escalation questions via confirm or deny.
5. For escalations that need nuance, use threaded responses before final confirm/deny.
6. Use the Tribe tab for shaping/escalation triage.
7. Use Product Owner View for squad-context decisions before escalating to tribe.
8. Use Mission Control for squad execution, explicit verification approve/reject decision, dry-run merge, and merge queue.
9. Run Verification Suite and require full gate pass; e2e retries once max, non-e2e failures block immediately.
10. On failed verification/reject, capture observability bundle and create remediation `NEXT` task before rerun.
11. Ship only after dry-run passes, policy checks pass, and human verification is recorded.
12. Generate and publish briefing after meaningful progress.
13. Update `[[execution-plan]]` and handoff note before ending the session.

## Required Delivery Hygiene
- Feature-length commits.
- Commit message includes breaking-change callout when relevant.
- Before/after image reference for user-visible UI changes when feasible.
- Human verification is mandatory before merge and must reference the exact feature/worktree item being approved.
- Dry-run merge must be conflict-free before verification and ship actions are enabled.
- Initiative branch model is mandatory:
  - one mission branch per initiative (`mission/<initiative-id>`)
  - one child worktree branch per queued task
  - queue merge into mission branch first, then mission branch into `main` on ship.
- Execution must persist assignment policy metadata on initiative notes (`Execution Policy` section).
- Policy registry requirements for MCP methods, codex skills, and codex rules must pass before ship.
- New user-visible features require at least one new e2e test to satisfy verification.
- Decision records must be either:
  - explicit yes/no questions, or
  - multiple-choice questions with declared options (A/B/C...).
