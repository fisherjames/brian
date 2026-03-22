---
title: Infrastructure
tags: #clsh #rnd #infrastructure
created: 2026-03-12
updated: 2026-03-14
---

# Infrastructure — clsh.dev

Local-first infrastructure: 3-tier tunneling, tmux session persistence, auth system, SQLite storage.

## Architecture

```
Local Machine
  ├── Express server (port 4030)
  ├── WebSocket (ws library)
  ├── PTY sessions (node-pty → tmux → shell)
  ├── SQLite database (~/.clsh/clsh.db)
  └── tmux config (~/.clsh/tmux.conf)
         │
         ▼
  3-Tier Tunnel (auto-fallback)
  ┌──────────────────────────────┐
  │ 1. ngrok (HTTPS, static URL) │ ← best: permanent URL, PWA-ready
  │ 2. SSH (localhost.run)        │ ← free: no signup, random URL
  │ 3. Local Wi-Fi (LAN IP)      │ ← fallback: same network only
  └──────────────────────────────┘
         │
         ▼
  Browser / Phone PWA
```

## The Perfect Experience

Two features combine to make clsh feel like a native app — not a web hack:

### 1. Session Persistence (tmux Control Mode)

When tmux is installed, clsh uses **tmux control mode (`-CC`)** to wrap every `zsh` and `claude` session. Control mode sends raw pane output as structured `%output` notifications instead of screen redraws, which means xterm.js gets the original byte stream and **scrollback works perfectly**.

```
WITHOUT TMUX:  node-pty → zsh               → dies with server
WITH TMUX:     node-pty → tmux -CC → zsh    → tmux survives server restart
```

**Why it matters:**
- Restart clsh → sessions survive → grid shows the same sessions with scrollback
- Long-running Claude Code sessions, builds, SSH connections all persist
- Mac reboot → start server → sessions reappear (tmux sessions survive in background)
- `brew install tmux` once, that's the entire setup
- Falls back gracefully to raw PTY if tmux isn't installed

**How it works:**
- `control-mode-parser.ts` — parses `%output` notifications, decodes octal escapes, encodes input as hex
- `tmux.ts` — detection, config writer (`~/.clsh/tmux.conf`), session list/kill, `capturePaneContent()`
- `pty-manager.ts` — dual-mode handlers (raw PTY + control mode), `send-keys -H` for input, `refresh-client -C` for resize
- `pty_sessions` SQLite table — stores (id, tmux_name, shell, name, cwd)
- Startup: `rediscoverAll()` reads DB → `capture-pane` recovers scrollback → reattaches in control mode → kills zombies
- Graceful shutdown: kills control mode clients but leaves tmux alive
- `CLSH_NO_TMUX=1` to disable; `tmux` shell type NOT wrapped (avoids tmux-in-tmux)

### 2. Permanent URL (ngrok static domain)

With a free ngrok static domain, clsh always comes back at the same URL.

```
WITHOUT STATIC DOMAIN:  Every restart → new URL → scan QR again
WITH STATIC DOMAIN:     Every restart → same URL → PWA just reconnects
```

**Why it matters:**
- Add to Home Screen once — it works forever
- JWT stored in sessionStorage persists on same origin
- No QR scanning after the first time
- Feels like opening an app, not connecting to a server

**Setup:**
```bash
# Free at ngrok.com — one static domain per account
NGROK_AUTHTOKEN=your_token
NGROK_STATIC_DOMAIN=your-name.ngrok-free.dev
```

### Combined Effect

```
1. brew install tmux
2. Add NGROK_AUTHTOKEN + NGROK_STATIC_DOMAIN to .env
3. npx clsh-dev → Add to Home Screen on phone
4. From now on: tap icon → Mac is there, sessions and all
```

Restart server, reboot Mac — doesn't matter. Tap the icon → terminal sessions are exactly where you left them.

## Lid-Close Networking (IMPORTANT)

**Problem**: When the MacBook lid closes, macOS powers down Wi-Fi after ~30 seconds even if the CPU is awake (caffeinate). This kills the ngrok/SSH tunnel and the phone PWA loses connection.

**Solution (3 layers):**

1. **`caffeinate -dis`** (`index.ts`) — prevents display, idle, and system sleep. Keeps CPU running. But does NOT keep Wi-Fi alive on its own.

2. **`sudo pmset -c tcpkeepalive 1`** (user runs once) — tells macOS to keep TCP connections alive when the lid is closed on AC power. This is the critical piece. Without it, Wi-Fi drops. The server prints a tip on startup if not configured.

3. **Tunnel auto-recovery** (`tunnel.ts`) — backup for when the network does drop:
   - Wake detection via time drift (5s interval, >15s gap = system slept)
   - SSH process death detection (`tunnelDead` flag on process close)
   - Health check: fetches own `/api/health` through the tunnel URL
   - Auto-recreation: closes dead tunnel, creates new one, reprints QR code
   - Works for both ngrok and SSH tunnels

4. **Client-side reconnection** (`ws-client.ts`) — `closeWebSocket()` method cleans up old WebSocket before creating new one, preventing zombie accumulation during reconnect cycles. `visibilitychange` + `online` event listeners trigger immediate reconnect when phone app comes back to foreground.

**User setup for perfect lid-close experience:**
```bash
# Run once (persists across reboots):
sudo pmset -c tcpkeepalive 1

# Then just use clsh normally — lid close works on AC power
```

**Known limitation**: On battery power, macOS forces full sleep when the lid closes. No software workaround exists. The tunnel monitor will recover when the lid opens.

## 3-Tier Tunnel System

Tries in order, falls back automatically:

| Tier | Method | Requires | URL Type | Best For |
|------|--------|----------|----------|----------|
| 1 | ngrok | `NGROK_AUTHTOKEN` in env or `~/.config/ngrok/ngrok.yml` | Static (`*.ngrok-free.dev`) or random | Daily use — permanent URL, PWA |
| 2 | SSH | Nothing (uses localhost.run) | Random (`*.lhr.life`) | Quick access — no signup needed |
| 3 | Local | Nothing | LAN IP (`192.168.x.x:port`) | Same Wi-Fi only |

Force a specific method: `TUNNEL=ssh npx clsh-dev` or `TUNNEL=local npx clsh-dev`

## Security Layers

1. HTTPS transport (ngrok or SSH tunnel — encrypted)
2. Bootstrap token (256-bit random, SHA-256 hashed, reusable for same device)
3. JWT sessions (8h expiry, httpOnly cookies via jose)
4. Environment variable sanitization (strips NGROK_AUTHTOKEN, JWT_SECRET, RESEND_API_KEY, CLAUDECODE)
5. Tunnel URL is unguessable (random subdomain unless static domain configured)

## SQLite Schema

```sql
-- Auth tokens
bootstrap_tokens (id, hash, created_at)
sessions (id, jwt_id, email, created_at, last_seen)
allowed_emails (email, created_at)

-- Session persistence
pty_sessions (id, tmux_name, shell, name, cwd, created_at)
```

WAL mode enabled for concurrent read performance. Database at `~/.clsh/clsh.db`.

## Configuration

Configuration loads from three sources (priority: env vars > .env > config.json > defaults):

1. **Environment variables** (highest priority)
2. **`.env` file** — `loadDotEnv()` probes monorepo root then cwd
3. **`~/.clsh/config.json`** — created by `npx clsh-dev setup` wizard (mode 0o600)

Environment variables:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | No | 4030 | Agent server port |
| `WEB_PORT` | No | same as PORT | Tunnel target (set to 4031 in dev for Vite) |
| `NGROK_AUTHTOKEN` | No | — | ngrok auth (tier 1 tunnel) |
| `NGROK_STATIC_DOMAIN` | No | — | Permanent URL for PWA |
| `TUNNEL` | No | auto | Force tunnel method: `ngrok`, `ssh`, or `local` |
| `CLSH_NO_TMUX` | No | — | Set to `1` to disable tmux persistence |
| `JWT_SECRET` | No | auto-generated | Persisted at `~/.clsh/jwt_secret` |
| `RESEND_API_KEY` | No | — | Magic link email (future) |
| `DB_PATH` | No | `~/.clsh/clsh.db` | SQLite database location |

## npx clsh-dev (One-Command Quickstart)

```bash
npx clsh-dev          # Start the agent server (no clone/install needed)
npx clsh-dev setup    # Interactive ngrok wizard → saves to ~/.clsh/config.json
npx clsh-dev --help   # Show help
```

**How it works**: The `clsh-dev` npm package imports `@clsh/agent` (which imports `@clsh/web`). On `npx`, npm downloads all three packages. The CLI sets `CLSH_CLI=1` env var, parses args, and dynamically imports `main()` from `@clsh/agent`.

**Path resolution**: `findWebDist()` in `server.ts` resolves the web frontend dist directory by:
1. Checking monorepo sibling path (`../../web/dist`) — for local dev
2. Using `createRequire` to resolve `@clsh/web/package.json` and finding its dist/ — for npm install

**Config file** (`~/.clsh/config.json`):
```json
{
  "ngrokAuthtoken": "...",
  "ngrokStaticDomain": "your-name.ngrok-free.dev",
  "port": 4030
}
```

## Related

- [[Backend]] — PTY manager, WebSocket handler, session persistence architecture
- [[Architecture-Decisions]] — Technology choices
- [[Security]] — Full security policy
- [[Frontend]] — WebSocket client, reconnection, session management
