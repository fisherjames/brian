---
title: Features
tags: #clsh #product #features
created: 2026-03-12
updated: 2026-03-12
---

# Features — clsh.dev

## Phone UI (Primary Experience)

| Feature | Priority | Status | Mockup |
|---------|----------|--------|--------|
| Mobile tab layout | P0 | Complete | — |
| iOS keyboard suppression | P0 | Complete | — |
| iOS Terminal keyboard (default, 6-row) | P0 | Complete | — |
| MacBook keyboard on phone (5-row) | P0 | Complete | `mockup-2-terminal-keyboard.html` |
| Context strip (touchbar replacement) | P0 | Complete | `mockup-2-terminal-keyboard.html` |
| tmux grid view (session cards, zoom) | P0 | Complete | `mockup-1-grid.html` |
| Keyboard skins (6 themes) | P0 | Complete | `mockup-3-skin-studio.html` |
| Skin Studio (theme selector) | P0 | Complete | `mockup-3-skin-studio.html` |
| Skin import/export (.kbd) | P1 | Complete | `mockup-3-skin-studio.html` |
| Settings panel (bottom sheet) | P0 | Complete | — |
| Editable session names | P0 | Complete | — |

### Keyboard Skins

1. **iOS Terminal** (default) — Bigger letter keys, iOS-style layout optimized for phone
2. **MacBook Silver** — Classic Apple look, compact 5-row layout
3. **Gamer RGB** — Rainbow animated gradient
4. **Custom Painted** — Each key a different color
5. **Amber Retro** — Phosphor terminal vibes
6. **Ice White** — Clean minimal

## Desktop UI (Secondary Experience)

| Feature | Priority | Status | Mockup |
|---------|----------|--------|--------|
| MacBook Pro frame | P0 | Complete | `index (1).html` |
| Three-pane layout | P0 | Complete | `index (1).html` |
| macOS menu bar + clock | P0 | Complete | — |
| tmux status bar | P0 | Complete | — |
| Notch indicator (Claude active) | P0 | Complete | — |
| Fullscreen toggle | P0 | Complete | — |

## Backend / Infrastructure

| Feature | Priority | Status |
|---------|----------|--------|
| PTY manager (zsh/tmux/Claude) | P0 | Complete |
| WebSocket streaming | P0 | Complete |
| Reconnection + backpressure | P0 | Complete |
| Bootstrap token auth + QR | P0 | Complete |
| JWT sessions (jose, 8h expiry) | P0 | Complete |
| 3-tier tunnel (ngrok → SSH → local) | P0 | Complete |
| SQLite session store | P0 | Complete |
| tmux session persistence | P0 | Complete |
| Magic link auth (Resend) | P1 | Not started |
| Rate limiting | P1 | Not started |
| `npx clsh-dev` one-command quickstart | P0 | Complete |
| `npx clsh-dev setup` ngrok wizard | P1 | Complete |

### Session Persistence (tmux Control Mode)

When tmux is installed, clsh uses **tmux control mode (`-CC`)** to wrap every `zsh` and `claude` session. The tmux layer is completely hidden. Users never interact with tmux directly. Control mode sends raw pane output as `%output` notifications, so xterm.js scrollback works perfectly (unlike normal tmux which sends screen redraws).

**Why it matters for the experience:**
- Server restarts don't kill your sessions, they survive in tmux
- On restart, clsh rediscovers surviving tmux sessions and presents them in the grid with full scrollback
- Long-running Claude Code sessions, builds, SSH connections all persist
- Combined with **ngrok static domain**, creates the "native app" feel: tap PWA icon → sessions are there

**How it works:**
- `node-pty → tmux -CC → zsh` instead of `node-pty → zsh`
- `control-mode-parser.ts` parses `%output` and decodes octal escapes to raw bytes
- User input encoded as hex via `send-keys -H`, resize via `refresh-client -C`
- `capture-pane -p -S - -e` bootstraps scrollback on reconnect after server restart
- Session metadata (id, shell, name, cwd) persisted in SQLite `pty_sessions` table
- Graceful shutdown kills control clients but leaves tmux alive; full cleanup kills everything
- Falls back to ephemeral sessions when tmux isn't installed, no errors, no warnings
- `CLSH_NO_TMUX=1` to opt out

### Permanent URL (ngrok static domain)

With a free ngrok static domain (`NGROK_STATIC_DOMAIN` in `.env`), clsh always comes back at the same URL. This is critical for the PWA experience:

- **First time**: scan QR → authenticate → Add to Home Screen
- **Every time after**: tap icon → PWA opens → already authenticated → sessions are there
- JWT stored in sessionStorage persists across visits to the same origin
- No QR scanning, no re-authentication — it just works like an app

**The combination of tmux + ngrok static domain is the core UX differentiator.** Without them, clsh is a cool demo. With them, it's your Mac in your pocket.

## Demo + Landing

| Feature | Priority | Status |
|---------|----------|--------|
| Demo animation engine | P0 | Complete |
| Demo scripts (terminal + Claude) | P0 | Complete |
| Landing page (phone mockup) | P0 | Complete |
| Mode detection (demo/live) | P0 | Complete |

## Future: Dev Server Tunnel Forwarding (P1.5)

| Feature | Status |
|---------|--------|
| Auto-detect URLs in terminal output (localhost:3000, etc.) | Not started |
| Wrap detected URL with existing tunnel (ngrok/SSH/WiFi) | Not started |
| Show forwarded URL to user (tap to open on phone) | Not started |

**Concept**: When a user runs `npm run dev`, `python -m http.server`, or any process that outputs a `localhost:XXXX` URL, clsh detects it and automatically exposes it through the existing tunnel. The user gets a public URL they can open on their phone to see their web app, API, or any other local server — alongside the terminal that's running it.

**Why it matters**: Developers already use clsh to access their terminal from their phone. If they're running a dev server, they also want to see the output. Instead of setting up a separate tunnel, clsh does it automatically. One tool, full access.

**Implementation ideas**:
- Regex scan PTY stdout for `localhost:\d+`, `127.0.0.1:\d+`, `http://0.0.0.0:\d+` patterns
- Use ngrok SDK to open additional tunnels to detected ports (or proxy through existing tunnel)
- For SSH/WiFi mode: reverse proxy via the agent's Express server
- Show a notification in the grid view: "Dev server detected on :3000 — [Open]"
- Optional: auto-open in a new browser tab on the phone

## Future: Remote Machines (P2)

| Feature | Status |
|---------|--------|
| Claude bootstrap script | Not started |
| Environment sync (local ↔ remote) | Not started |
| Fresh environment provisioning | Not started |
| Multiple Claude Code instances | Not started |

## Future: Teams (P2)

| Feature | Status |
|---------|--------|
| Shared terminal sessions | Not started |
| Presence indicators | Not started |
| Team workspaces | Not started |
| Parallel Claudes on different tasks | Not started |

## Key Differentiators

1. **Session persistence** — tmux control mode makes sessions immortal with full scrollback. Restart server, reboot Mac, sessions survive. No other phone terminal does this.
2. **Native app feel** — ngrok static domain + PWA = tap icon on phone, Mac is there. No QR, no re-auth, no setup.
3. **Keyboard skins** — No other terminal app lets you customize your phone keyboard like painting a mechanical keyboard
4. **tmux zoom grid** — See all sessions at a glance, zoom into any one
5. **Claude bootstrap** (future) — One script sets up your entire dev environment on a remote machine
6. **MacBook aesthetic** — Not a generic terminal. Looks and feels like your actual MacBook.

## Related

- [[Vision]] — Full product vision
- [[MVP]] — MVP scope
- [[Roadmap]] — Timeline
