# BrainTree For Codex

BrainTree is now a Codex-first workflow built from repository files plus a local viewer.

## Supported primitives

- Codex `/init`
- Codex `/plan`
- Codex `/resume`
- Codex `/status`
- `brain-tree-os init`
- `brain-tree-os resume`
- `brain-tree-os wrap-up`
- `brain-tree-os status`
- `brain-tree-os plan`
- `brain-tree-os sprint`
- `brain-tree-os sync`
- `brain-tree-os feature`
- `AGENTS.md`
- `BRAIN-INDEX.md`
- `Execution-Plan.md`
- `Handoffs/`

## Command mapping

- Old BrainTree session init maps to `brain-tree-os init`
- Old BrainTree resume maps to `brain-tree-os resume`
- Old BrainTree wrap-up maps to `brain-tree-os wrap-up`
- Old BrainTree status maps to `brain-tree-os status`
- In-chat planning maps to Codex `/plan`
- Codex conversation resume maps to Codex `/resume`
- Codex `AGENTS.md` bootstrap maps to Codex `/init`

## Unsupported assumptions

Do not assume:
- a documented automatic hook file format
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
