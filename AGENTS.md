# Brian Agent Doctrine

Brian is a markdown-first operating system.

## Workflow Contract
- intent -> proposal -> leadership discussion -> director decision -> tribe shaping -> squad planning -> execution
- no execution without a context packet
- no unresolved discussion without an escalation record
- every interaction must emit one of: answer | decision | task | risk | escalation

## Governance
- Markdown under `brian/` is source of truth for product, engineering, and operations memory.
- Runtime transitions are auditable through local append-only event logs under `~/.brian/state/<brainId>/events.ndjson`.
- Decision records are mandatory for unresolved escalations and for director-level approvals.
- Merge completion requires verification evidence.

## Compatibility
- V2 initiative flow is canonical.
- Legacy `next/work/end/mission` and execution-plan commands remain available as compatibility mode.
