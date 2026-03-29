# release

> Part of [[operations/index]]

## Local Verification
- `npm run -s typecheck`
- `npm run -s build`
- Run viewer and validate `/brains` and `/brains/:id` mission tabs.

## Merge Readiness
- Human verification recorded for each queued merge item.
- No unresolved merge conflicts.
- No stale unresolved worktrees.

## Rollback Rule
If a merge introduces regressions in mission flows, revert by commit and regenerate a briefing with explicit impact summary.
