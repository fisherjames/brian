# BrainTree For Codex

BrainTree is now a Codex-first workflow built from repository files plus a local viewer.

## Supported primitives

- `brain-tree-os init`
- `brain-tree-os resume`
- `brain-tree-os wrap-up`
- `brain-tree-os status`
- `AGENTS.md`
- `BRAIN-INDEX.md`
- `Execution-Plan.md`
- `Handoffs/`

## Unsupported assumptions

Do not assume:
- slash commands
- an automatic hook file format
- agent-specific hidden command directories

Those are not part of the supported Codex workflow for this project.

## Recommended project routine

1. Start the viewer with `brain-tree-os`.
2. Run `brain-tree-os init` once per existing project.
3. Run `brain-tree-os resume` at the start of every work session.
4. Open Codex and follow `AGENTS.md`.
5. Run `brain-tree-os wrap-up` before ending a substantial session.

## Expected brain files

- `.braintree/brain.json`
- `BRAIN-INDEX.md`
- `AGENTS.md`
- `Execution-Plan.md`
- `01_Product/`
- `02_Engineering/`
- `03_Operations/`
- `Agents/`
- `Handoffs/`
- `Templates/`
- `Assets/`
