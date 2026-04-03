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
- Mission keeps worktree-mapped `NEXT` + `MERGE` queue entries as the canonical UI control surface for delivery.
- Merge remains gated by human verification and conflict checks.
- Final release action is Mission Control **Ship to Main** (merge queue + push to `origin/main` when all gates pass).

## Product Surfaces
- CEO View: final escalations, strategic blockers, briefings.
- Director View: director-level decisions.
- Tribe View: tribe-level decisions.
- Product Owner View: squad-context decisions.
- Mission Control: execution, verification, merge queue.
- Agents + Workflow: squad definitions, personas, codex skills, codex rules.

## Delivery Hygiene
- Feature-length commits.
- Commit messages include explicit breaking-change callout.
- User-visible changes include before/after evidence note where feasible.
- Human verification is required before merge.

## Anti-Drift Rule
- Any doctrine change requires a same-pass sweep across CLI, Web, and MCP/projection behavior.
- Remove stale or tangential behavior rather than preserving compatibility by default.
