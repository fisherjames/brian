# Brian Agent Doctrine

Brian is a markdown-first operating system.

## Workflow Contract
- intent -> proposal -> leadership discussion -> director decision -> tribe shaping -> squad planning -> execution -> verification -> merge -> briefing
- no execution without a context packet
- no unresolved discussion without an escalation record
- every interaction must emit one of: answer | decision | task | risk | escalation

## Governance
- Markdown under `brian/` is source of truth for product, engineering, and operations memory.
- Runtime transitions are auditable through local append-only event logs under `~/.brian/state/<brainId>/events.ndjson`.
- Decision records are mandatory for unresolved escalations and for director-level approvals.
- Merge completion requires verification evidence.
- Blockers are explicit:
  - `hard_blocker`: progression must stop until resolved.
  - `advisory`: warning only, does not block progression.

## Roles + Ownership
- Squad resolves implementation questions first.
- Tribe resolves cross-squad product/architecture questions.
- Directors resolve strategic tradeoffs and risk posture.
- CEO resolves final escalations and approves high-impact decisions.

## Compatibility
- V2 initiative flow is canonical.
- Legacy aliases remain available short-term for migration only.
- Legacy invocations should emit a compatibility warning and map to a canonical V2 command.
