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

BrainTree uses a split model in Codex:
- Codex native slash commands for conversation/session control
- `brain-tree-os ...` shell commands for brain-specific project workflows

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

### `brain-tree-os plan [step]`

Create a linked step-planning note from `Execution-Plan.md`, then use Codex `/plan` to refine it in-chat.

### `brain-tree-os sprint`

Create a sprint note from in-progress and ready execution-plan steps.

### `brain-tree-os sync`

Scan the brain for broken wikilinks and disconnected notes.

### `brain-tree-os feature <name>`

Create a linked feature spec note in the product or vision area.

### `brain-tree-os codex`

Show the current mapping between Codex native slash commands and BrainTree workflow commands.

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

## Codex Mapping

Codex does have built-in slash commands such as `/init`, `/plan`, `/resume`, and `/status`.

BrainTree maps onto Codex like this:
- `/init` handles Codex session or `AGENTS.md` setup
- `/plan` handles in-chat planning
- `/resume` resumes a Codex conversation transcript
- `/status` shows Codex session state
- `brain-tree-os init` creates the project brain scaffold
- `brain-tree-os resume` reloads project brain context
- `brain-tree-os wrap-up` creates the next handoff template
- `brain-tree-os plan`, `sprint`, `sync`, and `feature` create or audit project-level brain artifacts

## Hooks

I still do not have evidence for a supported Codex hook file format comparable to the older agent-specific pre/post tool hook model. BrainTree therefore does not claim hook parity. The supported workflow uses:
- Codex native slash commands
- `brain-tree-os` shell commands
- repository brain files
- `AGENTS.md`
- the live viewer

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
