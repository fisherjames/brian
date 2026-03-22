---
title: R&D Department
tags: #clsh #rnd
created: 2026-03-12
---

# R&D — clsh.dev

Engineering department owning all technical architecture and implementation.

## Subfolders

| Area | Index | Description |
|------|-------|-------------|
| [[Frontend]] | `01_RnD/Frontend/` | React + Vite + xterm.js + Tailwind CSS v4 |
| [[Backend]] | `01_RnD/Backend/` | Node.js + Express + node-pty + WebSocket |
| [[Infrastructure]] | `01_RnD/Infrastructure/` | ngrok tunneling, auth system, SQLite |
| [[DevOps]] | `01_RnD/DevOps/` | CI/CD, GitHub Actions, Cloudflare Pages |
| [[Documentation]] | `01_RnD/Documentation/` | Architecture docs, API reference, security docs |
| [[Architecture-Decisions]] | `01_RnD/Architecture-Decisions/` | ADRs |
| [[Security-Audit]] | `01_RnD/Security-Audit.md` | Pre-launch security audit (4 critical, 9 high, 8 low findings) |

## Key Questions

1. Should we use Express or Hono for the HTTP server?
2. node-pty vs node-pty-prebuilt-multiarch for cross-platform support?
3. How do we handle the ngrok free-tier interstitial page?
4. What's our testing strategy for WebSocket + PTY integration?
5. How do we package for npx distribution?

## Status

Phase 1–5 complete. Session 10 (2026-03-13) — major UI polish + infrastructure:
- **Keyboard UX**: ↑↓ half-height stacked arrows, sticky modifier keys (opt/cmd/shift/ctrl toggle), orange 150ms flash feedback
- **Terminal View**: Removed TabBar, editable session name (pencil icon, MacBook keyboard input, no iOS keyboard), icon-only grid button
- **Grid View**: Session delete with confirmation overlay (red X replaces expand arrow), settings cog replaces grid+plus buttons
- **Settings Panel**: New bottom sheet (stats, keyboard skins, share access, screenshot tip)
- **Skin Studio**: Removed per-key painter section (color swatches, Apply to All, import/export .kbd), themes grid only
- **Skin Fixes**: Clear perKeyColors on skin switch, load DEFAULT_CUSTOM_COLORS for custom-painted, build rainbow colors for gamer-rgb, added data-kbd attr for CSS animation
- **Tunnel**: ngrok configured with .env (authtoken + static domain), Vite allowedHosts for ngrok/SSH domains
- **Dev Experience**: Turbo dev script filters (agent+web only), clean startup banner with QR code + token printout

Session 11 (2026-03-14) — quick fixes:
- Bootstrap token changed from one-time to reusable (same QR works for browser + PWA)
- PWA safe-area-inset padding for iPhone notch/Dynamic Island (`@media (display-mode: standalone)`)
- Extracted 1024×1024 profile image (`clsh-profile-1024.png`)

Session 15 (2026-03-14) — tmux session persistence + settings bug fix:
- **tmux persistence**: New hybrid pty-manager wraps zsh/claude sessions in invisible tmux. Sessions survive server restarts. Auto-detects tmux, falls back to ephemeral. New `tmux.ts` utility, `pty_sessions` SQLite table, `CLSH_NO_TMUX=1` opt-out.
- **Settings panel bug**: Fixed — panel was only rendered in grid-view branch of `App.tsx`. Now renders in terminal view too.
- **README**: Added "Session Persistence (tmux)" section explaining setup, importance, and opt-out.

Session 19 (2026-03-14) — **Security Audit**:
- Full security audit identified **4 critical + 9 high + 8 low** vulnerabilities
- Worst finding: magic-link endpoints give JWTs to anyone without verification (full RCE)
- Bootstrap token never expires (permanent backdoor from intercepted QR code)
- CORS wildcard + no WS origin check = any website can access the agent
- Created [[Security-Audit]] with code-level findings, file paths, and fixes
- Updated [[Execution-Plan]] with 3 new blocking steps (4.1a, 4.1b, 4.1c) before launch
- Updated [[Security]] to correct false claims (one-time token, rate limiting, cookies, etc.)

Session 16 (2026-03-14) — Bug fixes + UX enhancements:
- **tmux wrapping disabled**: tmux breaks xterm.js scrollback (sends screen redraws, not raw output). Reverted to raw PTY for smooth scroll. tmux code preserved for future re-enable with control mode (`-CC`).
- **Session rename fix**: Full protocol round-trip — `session_rename` message, backend `PTYManager.rename()`, `userRenamed` flag suppresses OSC 7 name overwrites.
- **Key repeat**: Hold-to-repeat for all non-modifier keys (400ms delay, 60ms interval). Backspace, arrows, letters all repeat.
- **Scroll-to-bottom on typing**: `scrollToBottom()` called on every key press from keyboard.
- **Touch scroll fix**: `onTouchMove` now actively calls `terminal.scrollLines()` with sub-pixel accumulation.
- **tmux isolation**: Dedicated socket (`-L clsh`), mouse off, deleted unused `TmuxStatusBar.tsx`.

Session 20 (2026-03-14) — User-reported bug fixes:
- **PWA icon fix**: Landing page used SVG for `apple-touch-icon` — iOS doesn't support SVG. Added PNG icons (180x180, 192x192, 512x512) to `apps/landing/`. Added `sizes="180x180"` to both landing + web app.
- **Service worker**: Added `sw.js` to `packages/web/public/` — caches app shell so tunnel-down serves cached app (enters demo mode) instead of tunnel provider's "no tunnel here :(" error page. Registered in `main.tsx`.
- **QR readability**: Removed orange ANSI coloring from QR code in `tunnel.ts`. Now uses terminal default colors — high contrast in both light and dark terminals.

Session 23 (2026-03-14) — Sleep/idle fix + security hardening + auth UX:
- **macOS sleep prevention**: `caffeinate -i -w <pid>` auto-starts with agent, prevents idle sleep. Killed on shutdown.
- **Persistent WS reconnection**: Removed 5-attempt hard cap → unlimited with exponential backoff (max 30s). Added `visibilitychange` + `online` event listeners for instant reconnect on wake. Added 25s heartbeat ping.
- **Server-side WS ping**: Native ping/pong every 30s detects and terminates dead connections, cleaning up stale subscriptions.
- **C1 fix: Magic-link removed**: Deleted `POST /api/auth/magic-link` + `GET /api/auth/verify` endpoints from `server.ts`. Removed `authenticateWithMagicLink` + SSE refs from `useAuth.ts`.
- **JWT 30d expiry**: Extended from 8h to 30d — PWA stays authenticated across server restarts (secret already persists at `~/.clsh/jwt_secret`).
- **Auth UX**: Paste icon replaced with "Paste" text button. Mobile input with `inputMode="none"` + native paste (long-press). Tap input opens custom keyboard. Keyboard overlays at bottom (no content shift).
- **Security review**: Full 17-finding audit documented (1 critical, 6 high, 5 medium, 5 low). Postinstall script confirmed safe.

Session 24 (2026-03-14) — **tmux control mode session persistence**:
- **Re-enabled tmux** via control mode (`-CC`) — solves the scrollback problem from session 16. Control mode sends raw pane output as `%output` notifications (octal-encoded) instead of screen redraws, so xterm.js gets the original byte stream and scrollback works perfectly.
- **New file: `control-mode-parser.ts`** — parses tmux control mode protocol, decodes octal escapes, encodes input as hex for `send-keys -H`, line-buffered `ControlModeLineBuffer` class.
- **Refactored `pty-manager.ts`** — dual raw/control-mode: `wireRawHandlers()` + `wireControlModeHandlers()`, shared `processSessionOutput()`. Input via `send-keys -H` (hex-encoded). Resize via `refresh-client -C <cols>,<rows>`.
- **`capture-pane` for reconnect**: On server restart, `capturePaneContent()` recovers existing scrollback before reattaching in control mode. Fixed `\n` → `\r\n` conversion so grid card preview renders correctly (without `\r`, text cascaded right).
- **Graceful fallback**: If tmux not installed or `CLSH_NO_TMUX=1`, falls back to raw PTY (ephemeral sessions). Auto-detected at startup.
- **README updated**: Session persistence section, tech stack, features, roadmap, config docs.
- **Pushed to GitHub** (`a804c3a`).

Session 28 (2026-03-15) — **OSS git workflow + README polish**:
- **Lid-Close Mode in README**: Added optional `sudo pmset -c tcpkeepalive 1` section with what it does, what it doesn't do, and how to undo. Investigated per-process IOKit `NetworkClientActive` assertion; concluded `pmset` is the only reliable mechanism for lid-close Wi-Fi.
- **PR-based git workflow**: Branch protection enforced for admins (PRs required, 0 approvals for solo), squash merge only, PR title as commit message, auto-delete branches, linear history. Fixed CI check names (were stale from job rename).
- **First release**: `v0.1.0` tagged on GitHub with full feature summary.
- **Setup-flow GIF**: Converted `assets/setup-flow.mp4` to optimized GIF (360px, 12fps, 4.2MB) via ffmpeg. GitHub doesn't render `<video>` tags from repo files, only from `user-attachments` CDN. GIF renders natively.
- **First PRs**: #5 (lid-close docs + video embed) and #6 (GIF conversion) merged through new workflow.

Session 30 (2026-03-15) — **npx clsh-dev one-command quickstart**:
- **CLI package**: Renamed from `@clsh/cli` to `clsh-dev` (unscoped for `npx`). Bin field `"clsh-dev"` (not `"clsh"` — npx requires bin name matching package name).
- **Setup wizard**: `npx clsh-dev setup` — interactive readline prompts for ngrok authtoken + static domain, saves to `~/.clsh/config.json` (mode 0o600).
- **Config system**: `config.ts` now loads `~/.clsh/config.json`. Priority: env vars > .env > config.json > defaults.
- **Path resolution**: `server.ts` `findWebDist()` probes monorepo sibling path first, then `createRequire` to resolve `@clsh/web/package.json` dist. Works in both monorepo dev and `npx` install layout.
- **Exported `main()`**: `packages/agent/src/index.ts` exports `main()`, guarded by `CLSH_CLI` env var to prevent auto-run on import.
- **turbo.json fix**: `typecheck` task now depends on `^build` so CLI can resolve @clsh/agent types.
- **npm publishing**: Created `@clsh` org on npmjs.com. Published: clsh-dev@0.1.0→0.1.1→0.1.2, @clsh/web@0.0.1→0.0.2, @clsh/agent@0.0.1. npm rejected `clsh` name (too similar to clsx/cli/slash).
- **Video re-render**: Shortened SetupFlow first scene (330→180 frames, 34s→29s total). Updated all scene text to `npx clsh-dev`. Recompressed + deployed to landing page.
- **Messaging update**: ~40+ files updated from "npx clsh" to "npx clsh-dev" across codebase + vault.
- **PRs merged**: #7 (npx clsh-dev quickstart), #8 (video assets), #9 (npm pipeline), #10 (bin name fix), #11 (stale refs + video re-render).
- **Landing page**: Redeployed to Cloudflare with updated setup-flow.mp4 and copy.

Session 34 (2026-03-16) — **Security hardening complete + splash screen + auth UX + connectivity fixes**:
- **Steps 4.1a + 4.1b COMPLETE**: All critical and high security fixes landed. C2 (single-use token, 5-min TTL), C3 (.gitignore verified), C4 (WS origin checking with dynamic allowedOrigins + local IP), H1 (CORS restricted), H2 (rate limiting), H3 (WS maxPayload 64KB), H5 (JWT as first WS message), H6 (token in URL hash fragment), H7 (resize validation), H9 (SSE removed), L5 (body limit 16KB), L6 (security headers).
- **Animated splash screen**: `SplashScreen.tsx` with staggered line-by-line ASCII CLSH reveal (1.8s), shimmer loop, 300ms fade-out. Integrated as gate in `App.tsx`.
- **Mobile auth simplified**: QR-only on mobile (removed token paste input, keyboard, Connect button). Desktop unchanged.
- **Token hidden from terminal**: Removed raw token printout from `tunnel.ts`. Token only in QR code now.
- **QR Scanner iOS fix**: `getUserMedia` with `ideal: 'environment'` + fallback to `video: true`.
- **WebSocket origin fix**: Added `getLocalIP()` to detect local network IP, phones on same Wi-Fi now connect.
- **iOS Safari replaceState fix**: Wrapped `window.history.replaceState` in try/catch (throws "The string did not match the expected pattern" in PWA standalone mode).
- **Connection status banner**: GridView shows orange "Reconnecting..." or red "Disconnected" banner with pulse animation.
- **Bug fixes**: Black screen after animation, stuck loader, Express trust proxy error, PWA install banner, Enter key QR regen, white flash, pencil icon size, dual-instance port conflicts.
- **PRs #17-#22 merged** (consolidated stacked PRs #17-#20 into #21, version bump in #22).
- **npm published**: clsh-dev@0.1.7, @clsh/agent@0.0.6, @clsh/web@0.0.3.

**Next**: Finish Step 4.1c (Security.md update, email verify, npm audit) → Step 4.2 Launch Day
