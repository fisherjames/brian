# clsh.dev — Agent Instructions

You are an AI agent working on the clsh.dev project vault. This file is your primary reference.

## What Is clsh?

**clsh** (clsh.dev) is a phone-first, open-source tool that gives developers real terminal access to their machine from any device. The primary experience is on your phone — a pixel-perfect MacBook-style keyboard (not the iOS keyboard), tmux-style session grids you can zoom into, and customizable keyboard skins. Desktop is supported too, with a MacBook Pro frame housing three live terminal panes.

**Core value prop**: Your Mac, in your pocket. But way more than that. One command to start: `npx clsh-dev`.

**Vision**: See `02_Product/Vision.md` for the full product vision — phone UI, MacBook keyboard, keyboard skins, remote machines, Codex bootstrap, solo→teams progression.

## Target Users

- Developers who want terminal access from their phone/tablet
- Codex users who want to monitor sessions remotely
- Developers working across multiple devices
- Mobile-first developers who want real terminal access on the go

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18, Vite 6, Tailwind CSS v4 | Fast dev, modern tooling |
| Terminal | xterm.js v5.5+ (WebGL renderer) | Industry-standard terminal emulator |
| Backend | Node.js 20+, Express, ws | Lightweight, WebSocket-native |
| PTY | node-pty | Real terminal sessions, not simulation |
| Tunnel | @ngrok/ngrok SDK | Programmatic HTTPS tunnels + QR code |
| Auth | jose (JWT), Resend (magic link) | Secure, one-time bootstrap tokens |
| Database | better-sqlite3 | Local, zero-config, WAL mode |
| Monorepo | Turborepo, npm workspaces | Parallel builds, shared deps |
| Landing | Cloudflare Pages | Static hosting, edge CDN |

## Vault Structure

| Folder | Purpose |
|--------|---------|
| `00_Company/` | Identity, vision, mission |
| `01_RnD/` | Architecture, frontend, backend, infra, devops, docs |
| `02_Product/` | MVP definition, roadmap, features |
| `03_Marketing/` | Social media, content, GTM, branding, SEO |
| `04_Community/` | Discord, GitHub community, contributors, growth |
| `05_Business/` | Competitors, market intel |
| `06_Legal/` | Open source licensing, security policy, privacy |
| `Handoffs/` | Session handoff notes (one per session, dated) |
| `Templates/` | Reusable note templates |
| `Docs/` | Source documents (Complete Technical Plan) |
| `Agents/` | Agent persona files |
| `Commands/` | Example command prompts and workflow notes |

## Project Context

- **Product**: clsh — phone-first terminal access to your machine
- **Primary UX**: Phone with MacBook keyboard (not iOS keyboard), tmux grid, keyboard skins
- **Secondary UX**: Desktop with MacBook Pro frame, three-pane layout
- **Business model**: Open source (MIT) → future cloud-hosted remote machines (paid SaaS)
- **Architecture**: Local-first MVP with ngrok tunneling → remote machines with Codex bootstrap → teams
- **MVP scope**: Agent (PTY + WebSocket + auth) + Web (xterm.js + MacBook UI) + Landing page + Demo mode
- **Monorepo**: `packages/agent`, `packages/web`, `packages/cli`, `apps/landing`
- **Domain**: clsh.dev
- **GitHub**: my-codex-utils/clsh
- **Stage**: Phase 4 (Launch) — 88% complete (21/24 steps)

## Research Sources

1. `Docs/compass_artifact_*.md` — **PRIMARY** — Complete production technical plan

## Rules for Agents

1. **Always use `[[wikilinks]]`** for cross-references between notes
2. **Keep files concise** — index files are navigational (20-40 lines), content files are substantive
3. **Use templates** from `Templates/` for new notes
4. **Tag with department hashtags**: #rnd, #product, #marketing, #community, #business, #legal
5. **Reference the Execution Plan** as the primary source of truth for build order
6. **Respect the architecture**: local-first now, cloud later
7. **Read VAULT-INDEX.md first** when starting work on any task
8. **Open source mindset**: Everything we build should be contributor-friendly
9. **Always update Execution-Plan.md** when completing or progressing any step
10. **Always create a handoff** in `Handoffs/` when wrapping up a session

## Team Workflow (Parallel Execution)

The Execution Plan defines **Parallel Groups** — steps that can run simultaneously via agent teams.

### How It Works

1. **`brain-tree-os resume`** identifies the files Codex should load first
2. **`brain-tree-os plan <step>`** or Codex **`/plan`** is used to break work into concrete tasks
3. If multiple tracks are possible, create isolated branches or worktrees outside the brain itself
4. Work is merged back, then the execution plan and handoff notes are updated

### Worktree Rules

- Use `isolation: "worktree"` when 2+ agents edit code in the same repo simultaneously
- Each worktree gets a descriptive name (e.g., `backend-core`, `frontend-core`)
- After agents complete, merge worktrees back to main branch
- Do NOT use worktrees for non-code work (marketing, social channels, domain setup)

### Handoff Protocol

Every session MUST end with `brain-tree-os wrap-up` which:
1. Updates `Execution-Plan.md` step statuses and progress percentages
2. Updates `VAULT-INDEX.md` with current department statuses
3. Creates `Handoffs/handoff-YYYY-MM-DD.md` with context for next session
4. Notes which steps are now unblocked by completed work

## Workflow Commands

| Command | Purpose |
|---------|---------|
| `brain-tree-os plan [step]` | Create a linked plan note for a specific step |
| `brain-tree-os wrap-up` | Complete a session, update vault, create a handoff template |
| `brain-tree-os resume` | Resume from where you left off |
| `brain-tree-os sprint` | Plan the week's steps |
| `brain-tree-os status` | Check progress across all departments |
| `brain-tree-os sync` | Audit graph health and disconnected notes |
| `brain-tree-os feature [feature]` | Create a feature planning note |
| Codex `/plan` | Turn the notes above into a concrete implementation plan |
