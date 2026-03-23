<div align="center">

<img src="packages/web/public/logo.png" alt="BrainTree OS" width="180" />

# BrainTree OS

**Give Codex a brain.**

A local-first project memory system for Codex. It gives an existing repository a structured brain with a viewer, indexed notes, execution plans, handoffs, and Codex-facing instructions in `AGENTS.md`.

[![npm version](https://img.shields.io/npm/v/brain-tree-os.svg)](https://www.npmjs.com/package/brain-tree-os)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green?logo=node.js&logoColor=white)](https://nodejs.org)

[Quick Start](#-quick-start) · [Commands](#-commands) · [Brain Format](#-brain-format) · [Workflow](#-workflow) · [Contributing](CONTRIBUTING.md)

<img src="docs/screenshots/demo-brain.png" alt="BrainTree OS - Brain viewer" width="756" />

</div>

---

## Quick Start

> **Requires [Node.js 20+](https://nodejs.org) and Codex**

### 1. Start the viewer

```bash
npx brain-tree-os
```

This starts the local BrainTree viewer and opens the brains page in your browser.

### 2. Initialize a brain inside an existing project

Open a second terminal in the project you want Codex to manage:

```bash
cd /path/to/your-project
npx brain-tree-os init
```

That command creates a Codex-first brain scaffold inside the repository and registers it in `~/.braintree-os/brains.json`.

### 3. Resume the project in Codex

Still inside the project:

```bash
npx brain-tree-os resume
codex
```

Use the files listed by `resume` as the starting context for the next session.

---

## Commands

BrainTree no longer depends on product-specific slash commands. Codex works best with plain shell commands and repository files.

### `brain-tree-os`

Start the viewer.

Options:
- `--port <number>`
- `--no-open`

### `brain-tree-os init`

Create a brain scaffold in the current project.

Options:
- `--name <text>`
- `--description <text>`

What it creates:
- `.braintree/brain.json`
- `BRAIN-INDEX.md`
- `AGENTS.md`
- `Execution-Plan.md`
- `Handoffs/`
- `Templates/`
- `Assets/`
- starter product, engineering, operations, and agent notes

### `brain-tree-os resume`

Show the core files Codex should read before doing non-trivial work.

### `brain-tree-os wrap-up`

Create the next handoff template in `Handoffs/` so the session ends with explicit continuity.

### `brain-tree-os status`

Show the current brain if you are inside one, otherwise list all registered brains.

---

## Brain Format

Every brain is a directory on your filesystem with this structure:

```text
my-project/
├── .braintree/
│   └── brain.json
├── BRAIN-INDEX.md
├── AGENTS.md
├── Execution-Plan.md
├── 01_Product/
├── 02_Engineering/
├── 03_Operations/
├── Agents/
├── Handoffs/
├── Templates/
└── Assets/
```

### Key files

- `BRAIN-INDEX.md` is the central hub linking the top-level notes.
- `AGENTS.md` contains Codex-facing working rules for the repository.
- `Execution-Plan.md` is the roadmap and current priority list.
- `Handoffs/` preserves continuity between sessions.
- `Assets/` stores screenshots, PDFs, and other reference material.

### Wikilinks

BrainTree uses `[[wikilinks]]` between notes. The viewer turns those links into a live graph, file tree, and note browser.

---

## Workflow

### Session 0

```bash
npx brain-tree-os
cd /path/to/project
npx brain-tree-os init
codex
```

### Every later session

```bash
cd /path/to/project
npx brain-tree-os resume
codex
```

Then:
1. Read `BRAIN-INDEX.md`, `AGENTS.md`, `Execution-Plan.md`, and the latest handoff.
2. Inspect the relevant folder index.
3. Make a narrow, real change.
4. Run `npx brain-tree-os wrap-up` before ending the session.

---

## Why There Are No Slash Commands Or Hooks

Codex exposes shell commands, `AGENTS.md`, and MCP integrations. It does not expose a supported slash-command system in the local CLI, and I do not have evidence for a supported automatic hook file format.

BrainTree therefore uses the primitives Codex actually supports:
- normal CLI commands
- repository brain files
- `AGENTS.md`
- the live viewer

That is the reliable path for Codex.

---

## The Viewer

The web viewer at `localhost:3000` shows your brain visually:
- graph view
- file tree
- markdown viewer
- execution plan pane
- session timeline

Files created or edited by Codex appear in the browser via filesystem watching.

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for our disclosure policy.

## License

MIT. See [LICENSE](LICENSE) for details.
