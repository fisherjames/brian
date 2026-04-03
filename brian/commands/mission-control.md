# mission control

> Part of [[commands/index]]

## Surface Responsibilities
- CEO Mission: decision inbox, escalation inbox, pipeline, briefings.
- Tribe tab: unresolved tribe escalations and shaping queue.
- Mission Control: squad execution queue, blockers, verification, worktree merge actions.

## Interaction Rules
- Approve/Deny only when the card shows an explicit question.
- Trigger next execution work only when hard blockers are clear.
- For live demos, wait for the in-app **Live Demo Gate** ready click before starting automation.
- Run **Verification Suite** before human approval; suite must pass full gates (format, lint, typecheck, unit, integration, e2e).
- E2E may retry once only; non-E2E failures block immediately.
- After start, use explicit **Approve** or **Reject** verification controls (reject requires reason and blocks step).
- Rejection must capture an observability failure bundle and auto-create remediation `NEXT`.
- Merge only after dry-run is conflict-free and verification is approved.
- Child task branches merge into `mission/<initiative-id>` first; ship merges mission branch into `main`.
- Ship is blocked unless policy requirements for MCP methods, codex skills, and codex rules are satisfied.
- Every Mission Control action must map to a concrete MCP call and update the markdown-backed workflow state.
