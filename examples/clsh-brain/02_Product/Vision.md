---
title: Product Vision
tags: #product #vision #clsh
created: 2026-03-12
updated: 2026-03-12
---

# clsh.dev — Product Vision

> Your Mac, in your pocket. But way more than that.

## Core Insight

clsh isn't just "terminal access from your phone." It's the feeling of having your 13-inch MacBook open in front of you — keyboard, tmux sessions, Claude Code instances — all running on a remote machine, controlled from your phone. No iOS keyboard. A real keyboard. A real terminal. Real development.

## The Experience

### What You See

**Zoomed out (Grid View)**: You see 2-4 terminal cards in a grid, like looking at your tmux sessions from far away. Each card shows a running Claude Code instance, a shell, or tmux — with live output scrolling. You can see what's happening across all sessions at a glance.

**Zoomed in (Terminal View)**: Tap any card to zoom into a full-screen terminal. The bottom half is a pixel-perfect MacBook keyboard — not the iOS keyboard, a real keyboard with fn, ctrl, cmd, arrows, the whole thing. The top half is your terminal running on the remote machine.

**Skin Studio**: Customize your keyboard. MacBook Silver (default), Gamer RGB (rainbow animated), Custom Painted (each key a different color), Amber Retro (phosphor terminal vibes), Ice White (clean minimal). Or paint individual keys with the per-key painter.

### What You Feel

- Like you're looking at your open MacBook from across the room (grid view)
- Like you're sitting at your laptop typing (zoomed-in view with real keyboard)
- Like Claude is your pair programmer sitting next to you, working while you watch from the couch

## The Perfect Experience

Two features combine to make clsh feel like a native app on your phone — not a flimsy web tool:

### Session Persistence (tmux)

When tmux is installed, clsh invisibly wraps every terminal session in tmux. You don't see tmux — no status bar, no prefix keys, no tmux-inside-tmux issues. But your sessions become immortal.

```
WITHOUT TMUX:  Restart server → all sessions die → start over
WITH TMUX:     Restart server → sessions survive → pick up where you left off
```

This matters because:
- **Long-running Claude Code sessions** don't vanish when you restart the server
- **Builds, SSH connections, running processes** survive across restarts
- **Your phone's grid view** shows the same sessions after a reboot — content intact, scroll position preserved
- **Zero friction** — `brew install tmux` once, never think about it again

### Permanent URL (ngrok static domain)

With a free ngrok static domain, clsh comes back at the **same URL every time**. Your phone's PWA bookmark always works.

```
WITHOUT STATIC DOMAIN:  Every restart → new URL → scan QR again
WITH STATIC DOMAIN:     Every restart → same URL → PWA just reconnects
```

This matters because:
- **Add to Home Screen once** — it works forever, like a native app
- **No QR scanning** after the first time
- **PWA stays authenticated** — JWT is stored in sessionStorage, same origin = same token
- **Feels like opening an app**, not connecting to a server

### Combined Effect

With both tmux + ngrok static domain:

```
1. brew install tmux && brew install ngrok
2. Add NGROK_AUTHTOKEN and NGROK_STATIC_DOMAIN to .env
3. npx clsh-dev → add PWA to phone home screen
4. From now on: tap icon → your Mac is there, sessions and all
```

Restart the server, reboot your Mac, doesn't matter. Tap the icon on your phone → your terminal sessions are exactly where you left them. That's the experience.

## Architecture Vision

### Phase 1: Local Tunnel (MVP — NOW)
Your Mac → ngrok tunnel → phone browser
- Unlimited PTY sessions (zsh, tmux, Claude Code) in a grid
- QR code to connect (first time) or PWA bookmark (every time after)
- tmux session persistence — sessions survive server restarts
- Demo mode for landing page

### Phase 1.5: Dev Server Tunnel Forwarding
Terminal output → auto-detect localhost URLs → expose via existing tunnel
- When `npm run dev` outputs `localhost:3000`, clsh wraps it and gives you a phone-accessible URL
- No extra setup — uses the same ngrok/SSH/WiFi tunnel already running
- See your web app on your phone right next to the terminal running it

### Phase 2: Remote Machines (NEXT)
Cloud VM → always-on → accessible from anywhere
- Claude runs a bootstrap script you provide
- Script duplicates your local environment to the remote machine (dotfiles, repos, configs)
- Everything stays synced between local and remote
- You don't do anything — just install and run Claude with the script
- Fresh environment capability — not just your laptop, any project

### Phase 3: Teams
Multiple developers → shared remote → collaborative terminals
- Start solo, advance to team workspaces
- Shared terminal sessions with presence indicators
- Multiple Claude Code instances working in parallel on different tasks

## UI Design Principles

### Phone UI (Primary Experience)

1. **No iOS keyboard** — We replace it entirely with a MacBook-style keyboard that fills the bottom of the screen. The user should feel like they have a 13-inch laptop keyboard in front of them.

2. **tmux vibe with zoom** — Grid of terminals (2 columns), tap to zoom into any one. Like tmux but with pinch-to-zoom semantics.

3. **Sleek tmux/oh-my-zsh aesthetic** — The terminal isn't basic. It's styled like a power-user's terminal with oh-my-zsh prompts, git branch indicators, and proper ANSI colors.

4. **Real keyboard design** — The MacBook keyboard mockup is extremely detailed: shift labels, fn/ctrl/cmd/opt, proper key sizing, 3D shadow effects, touchbar replacement strip with context-aware buttons (esc, commit, diff, plan).

5. **Customizable skins** — Users can customize every key. Predefined themes: MacBook Silver, Gamer RGB, Custom Painted, Amber Retro, Ice White. Per-key painter lets you color individual keys.

### Desktop UI (Secondary Experience)

The desktop view is a pixel-perfect MacBook Pro frame with:
- macOS menu bar with live clock
- Three panes side by side (zsh | tmux | Claude Code)
- tmux status bar at the bottom
- Traffic lights, notch with camera dot
- Fullscreen toggle

## Mockup Reference

All mockups are in `Docs/`:
- **mockup-1-grid.html** — Grid view with 4 session cards (2×2), tmux status bar, zoom-on-tap, new session button
- **mockup-2-terminal-keyboard.html** — Zoomed-in terminal with full MacBook keyboard, touchbar, tmux tabs, Claude Code session
- **mockup-3-skin-studio.html** — Skin selection UI with 5 themes, live keyboard preview, per-key color painter, import/export
- **index (1).html** — Full MacBook Pro desktop view with 3-pane Claude Code experience, pixel-perfect UI, streaming terminal output, interactive command input

## Key Differentiators

1. **Keyboard skins** — No other terminal app lets you customize your phone keyboard like painting a mechanical keyboard
2. **tmux zoom grid** — See all your sessions at a glance, zoom into any one
3. **Claude bootstrap** — One script sets up your entire development environment on a remote machine
4. **Environment sync** — Your local and remote always match
5. **MacBook aesthetic** — Not a generic terminal. It looks and feels like your actual MacBook.

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

- [[MVP]] — Current build scope
- [[Features]] — Feature breakdown
- [[Roadmap]] — Timeline
- [[Architecture-Decisions]] — Technical choices
