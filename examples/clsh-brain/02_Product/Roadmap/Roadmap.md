---
title: Roadmap
tags: #clsh #product #roadmap
created: 2026-03-12
updated: 2026-03-12
---

# Roadmap — clsh.dev

## Phase 1: Local Tunnel MVP (Weeks 1-6) — IN PROGRESS

> Your Mac → ngrok tunnel → phone browser

Build and launch the core open-source tool with phone-first design.

- [x] Monorepo setup + Turborepo
- [x] Backend agent (PTY + WebSocket + auth + ngrok)
- [x] Frontend desktop (xterm.js + MacBook Pro frame)
- [x] Frontend mobile (tab layout, iOS keyboard suppression, PWA)
- [x] Auth UI (bootstrap token, magic link, mode detection)
- [x] Demo mode + landing page (phone mockup)
- [x] GitHub repo + CI/CD + docs (README, CONTRIBUTING, SECURITY)
- [ ] Domain + Cloudflare deployment
- [ ] Launch: Product Hunt, Hacker News, Reddit

**Status**: 73% complete (11/15 execution steps)

## Phase 2: Phone Experience (Post-Launch)

> The real MacBook keyboard experience on your phone.

- [ ] **MacBook keyboard** — Pixel-perfect keyboard replacing iOS keyboard (fn, ctrl, cmd, opt, arrows, proper key sizing, 3D shadow effects)
- [ ] **Touchbar replacement strip** — Context-aware buttons (esc, F1-F3, commit, diff, plan)
- [ ] **tmux grid view** — 2-4 terminal cards in a 2×2 grid, tap to zoom in
- [ ] **Keyboard skins** — 5 themes: MacBook Silver, Gamer RGB, Custom Painted, Amber Retro, Ice White
- [ ] **Skin Studio** — Per-key color painter with 12-color palette, import/export .kbd files
- [ ] `npx clsh-dev` CLI tool
- [ ] PWA improvements (offline shell, push notifications)

**Mockups**: `Docs/mockup-1-grid.html`, `Docs/mockup-2-terminal-keyboard.html`, `Docs/mockup-3-skin-studio.html`

## Phase 3: Remote Machines (Future)

> Cloud VM → always-on → accessible from anywhere

- [ ] **Claude bootstrap script** — You provide a script, Claude runs it on a remote machine to duplicate your local environment (dotfiles, repos, configs)
- [ ] **Environment sync** — Your local and remote always match. You don't do anything — just install and run Claude with the script.
- [ ] **Fresh environments** — Not just your laptop — any project, any stack
- [ ] Cloudflare Worker proxy (`api.clsh.dev`)
- [ ] Usage-based billing design
- [ ] Workspace snapshots

## Phase 4: Teams (Future)

> Multiple developers → shared remote → collaborative terminals

- [ ] **Shared workspaces** — Multiple developers in the same terminal session
- [ ] **Presence indicators** — See who's in which session
- [ ] **Multiple Claude Code instances** — Parallel Claudes working on different tasks
- [ ] Team keyboard skins and customization
- [ ] Shared repos and environment templates

## Progression Model

```
Solo Developer               →  Team
─────────────                   ────
1 remote machine                N machines
1-4 terminal sessions           Shared workspaces
Personal keyboard skins         Team presence
Local → Remote sync             Shared repos
Claude Code solo                Multiple Claudes collaborating
```

## Related

- [[Vision]] — Full product vision
- [[MVP]] — Current build scope
- [[Features]] — Feature breakdown
- [[Execution-Plan]] — Detailed build order
