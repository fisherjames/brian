# Getting Started With Brian

This is the canonical setup flow for the `fisherjames/brain-tree-os` fork after the Brian migration.

## 1. Clone And Build

```bash
git clone https://github.com/fisherjames/brain-tree-os.git
cd brain-tree-os
npm install
npm run build
npm run install:cli
```

That installs both:

```bash
brian
brain-tree-os
```

Use `brian` going forward.

## 2. Start The Viewer

```bash
brian --port 3010
```

Open [http://localhost:3010/brains](http://localhost:3010/brains).

## 3. Initialize An Existing Project

```bash
cd /absolute/path/to/your-project
brian init
```

The init wizard prompts for:

- name
- description
- preset
- existing-doc linking
- package helper scripts

The default scaffold uses:

```text
AGENTS.md
.brian/brain.json
brian/
  index.md
  execution-plan.md
  product/
  engineering/
  operations/
  commands/
  agents/
  handoffs/
  templates/
  assets/
```

The repo is registered in:

```text
~/.brian/brains.json
```

Brian also mirrors registration into `~/.braintree-os/brains.json` so older tooling still sees it.

## 4. Resume Work In Codex

```bash
brian resume
codex
```

`brian resume` prints the canonical files to read before doing non-trivial work.

## 5. Migrate An Older BrainTree Repo

If a repo still uses root-level BrainTree notes:

```bash
brian migrate
```

That moves the legacy layout into `brian/` and `.brian/` when the destination paths are still free.

## 6. Useful Commands

- `brian status`
- `brian sync`
- `brian notes "product"`
- `brian plan EP-3`
- `brian sprint`
- `brian feature "merchant withdrawals"`
- `brian wrap-up`

## 7. What The Viewer Shows

The viewer reads repo notes and shows:

- graph links from wikilinks
- file tree
- execution-plan progress
- handoff history
- optional team status from `brian/commands/team-board.md`

The team-board path is important for projects that add repo-local orchestration outside Brian core.

## 8. Recommended Pattern

Keep Brian core responsible for:

- scaffold
- registry
- viewer
- note sync
- handoff creation

Keep project-specific orchestration in the managed repo, for example:

- `pnpm brain:start`
- `pnpm brain:plan`
- `pnpm brain:create`
- `pnpm brain:run`
- `pnpm brain:review`
- `pnpm brain:merge`

Then mirror progress back into `brian/commands/team-board.md`.

## 9. Important Limitation

Brian does not claim native Codex hook parity.

Codex skills are useful for behavior and specialization, but they do not provide a documented way to inject a prompt into an already-open live Codex session. For that reason Brian uses repo files and explicit commands instead of pretending hidden hooks exist.
