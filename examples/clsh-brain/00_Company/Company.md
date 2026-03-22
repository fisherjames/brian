---
title: clsh.dev — Company Overview
tags: #clsh #company
created: 2026-03-12
---

# clsh.dev

> Your Mac, in your pocket.

## What We Build

**clsh** is an open-source tool that gives developers browser-based access to their local machine's terminal and Claude Code sessions from any device. Three live terminal panes inside a pixel-perfect MacBook Pro frame — a root shell, a tmux session, and a Claude Code pane — all streaming in real time over WebSocket through an auto-generated ngrok tunnel.

## How It Works

1. `npx clsh-dev`
2. Agent spawns real PTY sessions (zsh, tmux, claude)
3. ngrok tunnel auto-creates HTTPS URL + QR code
4. Scan QR on phone — instant terminal access
5. xterm.js renders pixel-perfect terminals in browser

## Target Users

- Developers who want terminal access from any device
- Claude Code users monitoring sessions remotely
- Developers working across multiple devices
- Mobile-first developers who want real terminal on the go

## Differentiators

- **One command to start** (`npx clsh-dev`) — zero config, zero signup
- **Real PTY sessions** — not a simulation, full terminal with colors/vim/everything
- **Claude Code native** — dedicated pane for Claude Code streaming
- **Pixel-perfect MacBook Pro UI** — notch, menu bar, traffic lights
- **Mobile-optimized** — tab layout, PWA support, keyboard suppression
- **Open source** — MIT license, community-driven

## Business Model

1. **Phase 1 (now)**: Open source tool — free, community-driven
2. **Phase 2 (future)**: Cloud-hosted remote machines — `clsh cloud start` provisions GCP containers, usage-based pricing

## Links

- **Domain**: clsh.dev
- **GitHub**: github.com/my-claude-utils/clsh
- **License**: MIT
