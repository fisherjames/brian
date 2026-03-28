# Brian For Codex

Brian is the repo memory layer. Codex is the execution engine.

## Brian Commands

Canonical workflow:
- `brian next`
- `brian work`
- `brian end`
- `brian status`
- `brian mission`

Compatibility and maintenance:
- `brian init`
- `brian resume`
- `brian wrap-up`
- `brian notes`
- `brian migrate`
- `brian plan`
- `brian sprint`
- `brian sync`
- `brian spec`
- `brian feature` (alias)

## Codex Slash Commands

- `/init`
- `/plan`
- `/resume`
- `/status`

They are complementary:

- Codex slash commands control the current conversation.
- Brian commands control the repo memory and managed workflow.

## Managed Session Flow

Start:

```bash
brian work --role backend
```

End:

```bash
brian end --role backend
```

The managed skill pack supplies the reusable behavior. Brian notes supply the project memory.

Mission Control observer loop (Team Tracker):

1. Open `/brains/<id>` and switch to `Team Tracker`.
2. Click `Start Observer` to enable MCP-based queue auditing.
3. Work through `Start Next Work`, verification, and merge queue actions.
4. Observer auto-adds actionable `NEXT:`/`BLOCKER:` items when it detects dead-ends, conflicts, unresolved worktrees, or malformed merge metadata.
5. Click `Stop Observer` when the mission is stable.

Queue contract:
- `NEXT:` items should be feature-length and include `feature=`, `worktree=`, `image=`, `breaking=`.
- `MERGE:` items should use `worktree=<branch> -> main` and include `feature=`, `image=`, `breaking=`.
- `Start Next Work` should remain blocked when hard blockers exist.

## Honest Limit

Codex skills do not provide a documented way to inject text into an already-open live Codex thread. Brian therefore uses explicit commands for session start and wrap-up instead of pretending that hidden hooks exist.
