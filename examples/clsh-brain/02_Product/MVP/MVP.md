---
title: MVP Definition
tags: #clsh #product #mvp
created: 2026-03-12
updated: 2026-03-12
---

# MVP — clsh.dev

Minimum viable product for open source launch.

> The MVP is phone-first. Desktop is supported but the phone experience is the star.

## MVP Feature Set

### P0 — Must Have for Launch

#### Backend
- [x] PTY manager (zsh + tmux + Claude Code sessions)
- [x] WebSocket streaming with reconnection + backpressure
- [x] Bootstrap token auth with QR code
- [x] JWT session management (jose, 8h expiry)
- [x] 3-tier tunnel (ngrok → SSH → local Wi-Fi)
- [x] SQLite session store (better-sqlite3, WAL mode)
- [x] tmux session persistence (sessions survive server restarts)

#### The Perfect Experience Setup

Two optional but transformative features make clsh feel like a native app:

**1. tmux session persistence** (`brew install tmux`)
- Sessions survive server restarts and Mac reboots
- clsh auto-detects tmux — no config needed
- Zero UI changes — grid shows the same sessions after restart

**2. ngrok static domain** (free at ngrok.com)
- Same URL every time → PWA bookmark always works
- Add to Home Screen once → tap icon forever
- JWT persists on same origin → no re-authentication

**Combined**: tap PWA icon → sessions are there, exactly where you left them. That's the product.

#### Frontend — Desktop
- [x] MacBook Pro frame UI (pixel-perfect bezel, notch, traffic lights)
- [x] Three-pane layout (zsh | tmux | Claude Code)
- [x] tmux status bar, macOS menu bar with live clock

#### Frontend — Phone (Primary Experience)
- [x] Mobile tab-based layout (suppresses iOS keyboard)
- [x] PWA meta tags (apple-mobile-web-app-capable)
- [x] 100dvh viewport for iOS Safari

#### Demo + Landing
- [x] Demo mode (auto-starts when no backend reachable)
- [x] Demo animation engine with scripted terminal sequences
- [x] Landing page at clsh.dev with phone mockup + interactive demo

#### Auth
- [x] Auth screen UI (bootstrap token + magic link)
- [x] useAuth hook (token storage, SSE listener)
- [x] Mode detection (2s WebSocket probe → demo/live)

### P1 — Post-Launch Polish (SHIPPED)

- [x] **iOS Terminal keyboard** — Default 6-row layout with bigger keys for phone
- [x] **MacBook keyboard** — Classic 5-row layout (available as skin)
- [x] **Context strip** — Touchbar replacement (esc, F1-F5, commit, diff, plan)
- [x] **tmux grid view** — Session card grid, tap to zoom into any session
- [x] **Keyboard skins** — 6 themes: iOS Terminal, MacBook Silver, Gamer RGB, Custom Painted, Amber Retro, Ice White
- [x] **Skin Studio** — Theme selector with live preview
- [x] **Session persistence** — tmux wrapping, survive restarts
- [x] Session reconnection with buffer replay
- [ ] Magic link auth via Resend
- [x] `npx clsh-dev` CLI bootstrap utility

### P2 — Remote Machines & Teams

- [ ] **Remote machine support** — Cloud VM, always-on, accessible from anywhere
- [ ] **Claude bootstrap script** — One script duplicates your local environment to remote
- [ ] **Environment sync** — Local and remote always match (dotfiles, repos, configs)
- [ ] **Multiple Claude instances** — Parallel Claude Code sessions working on different tasks
- [ ] **Team workspaces** — Shared terminal sessions with presence indicators
- [ ] File sync between local and remote
- [ ] Usage-based billing

## Current State

Phase 1-5 complete. All P0 + most P1 features shipped. Landing page live at clsh.dev.
Session persistence (tmux) and permanent URL (ngrok static domain) provide the "native app" experience.
**npx clsh-dev** published to npm (v0.1.2) — one command to start, no clone/install needed. Setup wizard for ngrok config.
Phase 4.2 (Launch Day) is next — security hardening (4.1a/b/c) must complete first.

## Related

- [[Vision]] — Full product vision
- [[Features]] — Feature breakdown with status
- [[Roadmap]] — Timeline
- [[Execution-Plan]] — Build order
