# execution plan

> Part of [[index]]

## Phase 1 - V2 Core Product

### EP-1 Director decision quality
- **Status**: in_progress
- **Goal**: All decisions and escalations carry explicit yes/no questions and are resolved as confirmed or denied.

### EP-2 Mission Control + Tribe split
- **Status**: in_progress
- **Goal**: Squad-level orchestration is in Mission Control, tribe-level triage is in the Tribe tab.

### EP-3 Notes baseline reset
- **Status**: in_progress
- **Goal**: Brian notes are V2-only and preserve product direction from prior learning.

## Phase 2 - Deliverable Readiness

### EP-4 CEO context clarity
- **Status**: in_progress
- **Goal**: Pending decisions/escalations include enough context for one-click approve/deny without noisy logs.

### EP-5 Record navigation reliability
- **Status**: in_progress
- **Goal**: Every initiative, discussion, decision, and briefing in CEO view opens its source markdown note reliably.

### EP-6 Dogfood automation loop
- **Status**: in_progress
- **Goal**: Run repeated initiative cycles from UI and finish with clean merge/worktree state.

## CEO Plan Rework
### 2026-03-29T12:56:02.867Z
- Prompt: Prioritize CEO context clarity and clickable record detail this sprint.
- Next objective: EP-1 Director decision quality
- Rework focus:
  - Keep explicit decision and escalation questions in all approval gates.
  - Keep initiative flow aligned to workflow contract without stage skipping.
  - Keep merge gated by human verification and conflict-free state.

### 2026-03-29T17:30:00.000Z
- Prompt: Close README gap initiatives with real lifecycle execution and enforce coherent V2-only runtime behavior.
- Next objective: EP-4 CEO context clarity
- Rework focus:
  - Enforce execution policy metadata from Agent Lab assignments during `initiative.execute`.
  - Improve Agent Lab catalog curation signals in CEO Mission (score + freshness + query hits).
  - Use safe autopilot start/state/stop with governance-safe blocking and explicit operator feedback.
