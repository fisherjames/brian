---
title: Backend
tags: #clsh #rnd #backend
created: 2026-03-12
---

# Backend — clsh.dev

Node.js agent that spawns PTY sessions and streams them over WebSocket through ngrok.

## Tech Stack

- **Node.js 20+** with ESM modules
- **Express** for HTTP + SSE endpoints
- **ws** for WebSocket handling
- **node-pty** for real PTY sessions (zsh, tmux, claude)
- **better-sqlite3** for session/token storage (WAL mode)
- **@ngrok/ngrok** SDK for programmatic tunnel creation
- **jose** for JWT signing/verification
- **Resend** for magic link emails

## Key Files

- `index.ts` — Entry point: boots server, ngrok, tmux init, session rediscovery, prints QR
- `server.ts` — Express HTTP + WebSocket setup
- `pty-manager.ts` — Dual-mode PTY session lifecycle (raw PTY or tmux control mode; create, reattach, rediscover, resize, destroy)
- `control-mode-parser.ts` — tmux control mode protocol parser (octal decoder, hex input encoder, line buffer)
- `tmux.ts` — tmux detection, config writer, session list/kill, capture-pane for reconnect
- `ws-handler.ts` — WebSocket message routing
- `auth.ts` — Bootstrap token, JWT, magic link verification
- `tunnel.ts` — 3-tier tunnel: ngrok → SSH (localhost.run) → local WiFi; **tunnel monitor** with wake detection (time drift), SSH death detection, health check via `/api/health`, auto-recreation
- `power.ts` — macOS pmset check on startup; prints tip for `sudo pmset -c tcpkeepalive 1` if lid-close networking not configured
- `db.ts` — SQLite schema + prepared statements (bootstrap_tokens, sessions, pty_sessions)
- `config.ts` — Environment loading (multi-path .env probing + `~/.clsh/config.json` reader), JWT secret persistence, tmux opt-out. Priority: env vars > .env > config.json > defaults.

## Current State

Complete — all backend features shipped. tmux control mode session persistence (session 24). Lid-close networking: caffeinate `-dis`, tunnel auto-recovery with wake detection, pmset startup check (session 27). `main()` exported for CLI consumption (session 30). `findWebDist()` resolves `@clsh/web` dist in both monorepo and npm install layouts. Published as `@clsh/agent@0.0.1` on npm.

## Architecture: Session Persistence (tmux Control Mode)

```
WITHOUT TMUX:  node-pty → zsh               (dies with server, scrollback works)
WITH TMUX:     node-pty → tmux -CC → zsh    (tmux survives restart, scrollback works)
```

**Why control mode (`-CC`)?** Normal tmux attachment sends screen redraws (cursor positioning, clear screen) which destroys xterm.js scrollback. Control mode sends structured `%output` notifications containing the raw pane output (octal-encoded), preserving the original byte stream for xterm.js.

**Data flow:**
1. Shell output → tmux server (persists) → `%output %0 <octal-encoded data>`
2. `ControlModeLineBuffer` parses lines, `decodeTmuxOctal()` decodes → raw bytes
3. Raw bytes → WebSocket → xterm.js (scrollback works!)

**Input flow:**
1. User keystroke → WebSocket → `buildSendKeysCommands()` → `send-keys -t <session> -H <hex>`
2. tmux delivers hex-decoded bytes to the pane as keyboard input

**Resize:** `refresh-client -C <cols>,<rows>` (not `pty.resize()`)

**Reconnect after restart:**
1. `capturePaneContent()` runs `tmux capture-pane -p -S - -e` (scrollback + screen with ANSI colors)
2. Content converted `\n` → `\r\n` (xterm.js needs carriage return for correct column positioning)
3. Added to session buffer → replayed to client on subscribe
4. Control mode client attached for live output going forward

**Key details:**
- tmux is invisible (no status bar, no prefix key, `~/.clsh/tmux.conf`)
- Only `zsh` and `claude` shell types are wrapped; `tmux` shell type NOT wrapped (avoids tmux-in-tmux)
- Session metadata (id, tmux_name, shell, name, cwd) persisted in SQLite `pty_sessions` table
- On startup: `rediscoverAll()` reads DB → reattaches surviving tmux sessions → kills zombies
- Graceful shutdown (`destroyAll`): kills control mode clients but leaves tmux alive
- Full cleanup (`destroyAllIncludingTmux`): kills everything
- `CLSH_NO_TMUX=1` to disable; graceful fallback to raw PTY if tmux not installed
