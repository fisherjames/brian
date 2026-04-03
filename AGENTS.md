# Brian Doctrine

Brian is a delegated company operating system in markdown.

## Single Lifecycle
- intent -> director discussion -> director decision proposal -> CEO reviews proposal PDF -> CEO approves proposal PDF -> tribe shaping -> squad planning -> execution -> verification -> merge -> briefing
- Every stage must leave written evidence in `brian/`.

## Decision Authority
- Escalation chain is fixed and stepwise: squad -> tribe -> director -> ceo.
- Escalation at one level becomes a decision at the next level.
- CEO is exception-only: CEO handles only fully escalated, non-inferable decisions.
- Inferable decisions resolve at the lowest authorized level and record rationale.

## Planning Contract
- `brian plan <initiative-id> --squad <name>` starts squad planning discussion.
- Planning always emits a question set.
- Team Lead asks Product Owner first.
- Product Owner resolves within authority/context and queries up-chain only for unresolved questions.
- Planning pauses only if escalation reaches CEO.
- If CEO escalation is not required, planning moves directly to execution.
- If CEO rejects a proposal PDF, director discussion must reopen with explicit feedback before a revised proposal is submitted.

## Mission Contract
- `brian mission <initiative-id> --squad <name>` runs real implementation work inside workflow guardrails.
- Mission creates one initiative branch `mission/<initiative-id>` and uses child worktree branches per task.
- Mission keeps worktree-mapped `NEXT` + `MERGE` queue entries as the canonical UI control surface for delivery.
- Suggested next work is the next incomplete step inside the active initiative scope.
- Live demo flow starts at **I'm Ready**, then human verification is explicit **Approve/Reject** after task start.
- Merge remains gated by human verification and conflict checks.
- Dry-run merge must pass before human verification can be recorded and before Ship is enabled.
- Final release action is Mission Control **Ship to Main**: merge child worktrees into `mission/<initiative-id>`, merge mission branch into `main`, then push to `origin/main`.

## Product Surfaces
- CEO View: final escalations, strategic blockers, briefings.
- Director View: director-level decisions.
- Tribe View: tribe-level decisions.
- Product Owner View: squad-context decisions.
- Mission Control: execution, live demo readiness gate, verification, merge queue.
- Agents + Workflow: squad definitions, personas, codex skills, codex rules.

## Delivery Hygiene
- Feature-length commits.
- Commit messages include explicit breaking-change callout.
- User-visible changes include before/after evidence note where feasible.
- Human verification is required before merge.
- Verification suite must pass full gate set: format, lint, typecheck, unit, integration, e2e.
- E2E retries once only; non-E2E failures block immediately.
- New user-visible features require at least one new e2e test.
- Failed verification must capture observability evidence and auto-create remediation `NEXT`.
- Ship requires policy checks for MCP methods, codex skills, and codex rules.

## Interaction Output Contract
- every interaction must emit one of: `question`, `decision`, `handoff`, `task_update`, `verification_record`, or `briefing`.
- Free-form chat without a workflow artifact is not valid operating output.

## Anti-Drift Rule
- Any doctrine change requires a same-pass sweep across CLI, Web, and MCP/projection behavior.
- Remove stale or tangential behavior rather than preserving compatibility by default.
