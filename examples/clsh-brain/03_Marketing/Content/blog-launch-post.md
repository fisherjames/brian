---
title: "Launch Blog Post"
tags: #clsh #marketing #content #blog
created: 2026-03-13
platform: Dev.to, Hashnode
---

# How I Built clsh: Phone-First Terminal Access to Your Mac

> Publish on Dev.to and cross-post to Hashnode. Use the Dev.to canonical URL.
> Tags for Dev.to: #opensource #typescript #terminal #webdev
> Tags for Hashnode: open-source, typescript, terminal, web-development

---

## The Post

### How I Built clsh: Phone-First Terminal Access to Your Mac

I use Claude Code a lot. Not "a few commands a day," full refactoring sessions that run for minutes at a time. And I kept running into the same problem: I'd walk away from my desk, grab my phone, and have zero visibility into what was happening.

Is it still running? Did it error out? Is it about to overwrite something it shouldn't?

I tried SSH clients. I tried web-based terminals. Every option had the same flaw: the iOS keyboard. Try typing `kubectl get pods -n production --sort-by=.metadata.creationTimestamp` on a touchscreen. It's miserable.

So I built **clsh**, an open-source tool that gives you real terminal access to your Mac from your phone, with a keyboard that actually works.

Since it's real PTY sessions, everything that runs in a terminal just works. Claude Code's TUI, Aider's diff view, tmux, vim, git, whatever. This turned out to be one of the most important use cases: with AI coding agents running long sessions, you need a way to monitor and control them from anywhere.

This is the story of how I built it, the technical decisions I made, and what I learned along the way.

### The Core Architecture

clsh has three pieces: an **agent** that runs on your Mac, a **web frontend** you open on your phone, and a **tunnel** connecting them.

**The Agent**

The agent is a Node.js process running Express, WebSocket, and node-pty. When you start it, it spawns real PTY sessions. Not `child_process.exec`, not Docker containers, actual pseudoterminal sessions attached to your shell.

I chose node-pty over alternatives because it gives you true PTY semantics: SIGWINCH for resize, proper signal forwarding, and full ANSI escape sequence passthrough. If your terminal can do it locally, clsh can do it remotely.

Each session gets its own PTY and its own WebSocket connection. The agent tracks sessions in SQLite (WAL mode for concurrent reads) and authenticates requests with JWTs. When tmux is installed, sessions are wrapped in tmux, so they survive server restarts. Close your laptop, reopen, and your sessions are still there.

```
Phone Browser  <-->  WebSocket  <-->  node-pty (zsh)
Phone Browser  <-->  WebSocket  <-->  node-pty (tmux)
Phone Browser  <-->  WebSocket  <-->  node-pty (claude)
```

**The Tunnel**

clsh has a 3-tier tunnel system. It tries ngrok first (via the Node SDK, not the CLI), falls back to SSH tunneling via localhost.run (no account needed), and finally local WiFi if you're on the same network. When the agent starts, it opens a tunnel and gives you the URL + a QR code. Scan the QR code on your phone and you're connected.

The nice thing about the SDK approach is that the tunnel lifecycle is managed by the process. Agent starts, tunnel opens. Agent stops, tunnel closes. No dangling processes. The SSH fallback means you can use clsh without any third-party account at all.

Authentication works via one-time bootstrap tokens. The first time you connect, the agent generates a JWT signed with a secret stored in `~/.clsh/jwt_secret`. The token is embedded in the URL. Subsequent connections use the JWT directly (stored in localStorage on the phone).

**The Frontend**

React 18 + Vite 6 + xterm.js 5.5 with the WebGL renderer. The frontend is designed phone-first: everything from the layout to the touch handling assumes a phone screen.

### The Keyboard Problem (and Solution)

This was the hardest part of the entire project.

The iOS keyboard is designed for text, not terminals. You don't have Ctrl. You don't have fn. Arrow keys are there but buried. Tab requires switching layouts. Option and Command don't exist. Every terminal session becomes a fight with autocorrect and key prediction.

My solution was kind of radical: suppress the iOS keyboard entirely and build custom keyboard components for the phone.

clsh ships with two keyboard layouts. The default is `IOSKeyboard`, a 6-row iOS-style layout with oversized letter keys optimized for touch typing. The alternative is `MacBookKeyboard`, a pixel-perfect 5-row MacBook layout with the function row, modifier keys, and arrow cluster. Both render every key and map each press to the correct terminal escape sequence. `Ctrl+C` sends `\x03`. Arrow up sends `\x1b[A`. The key sizing follows Apple's proportions, scaled to fit a phone width.

The tricky part was **modifier keys**. On a physical keyboard, you hold Ctrl while pressing C. On a touchscreen, you can't hold two keys simultaneously. The solution: sticky modifiers. Tap Ctrl once to activate it (it highlights), tap your target key, and Ctrl automatically deactivates. Tap it twice to lock it on.

This small UX decision, making modifiers toggle instead of hold, transformed the phone terminal experience from "barely usable" to "surprisingly productive."

### The Session Grid

When you're running multiple terminal sessions, you need to see them all. clsh shows a tmux-style 2x2 grid where each card displays a miniaturized live preview of the session.

The previews aren't screenshots. They're generated by reading the xterm.js buffer cell-by-cell (each cell's character, foreground color, and background color) and converting it to colored HTML spans. The result is a tiny, accurate, colorful representation of what each session is doing.

Tap any card to zoom into full-screen terminal mode. The grid feels like looking at your open MacBook from across the room, and tapping feels like sitting down at it.

### Keyboard Skins (The Fun Part)

I didn't plan to build keyboard skins. It happened because I was staring at the default keyboard and thought "what if it was RGB like a gaming keyboard?"

clsh ships with six themes:

- **iOS Terminal**: The default. 6-row layout with oversized letter keys, optimized for touch.
- **MacBook Silver**: Clean, minimal, looks like an actual MacBook keyboard.
- **Gamer RGB**: Animated rainbow gradient across the keys. Because why not.
- **Custom Painted**: Each key a different color, like a paint palette exploded on your keyboard.
- **Amber Retro**: Phosphor terminal aesthetic. Orange keys, dark background.
- **Ice White**: Minimal, high-contrast, all white.

You can customize per-key colors and export skins as `.kbd` files. The entire skin system uses CSS custom properties, so themes are just variable swaps. Keyboard skins are the mechanical keyboard culture of phone terminals. I didn't expect it to be one of the most satisfying features to use.

### Demo Mode

The landing page at clsh.dev works without any backend. It runs a demo mode that simulates terminal sessions with realistic typing, ANSI output, and interactive keyboard response.

Building a convincing demo was important because the entire product is about a *feeling*, the feeling of having your MacBook in your pocket. If someone visits the landing page on their phone and the demo makes them go "wait, this is actually usable," the product sells itself.

The demo auto-types commands at human-like speeds (80-140ms per character for Claude responses, faster for regular shell commands), renders real ANSI color output, and lets you tap the keyboard to see it respond. It runs on a 2-second backend connection timeout. If no backend is reachable, demo mode activates automatically.

### The Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 18, Vite 6, Tailwind CSS v4 | Fast dev, hot reload, CSS-first config |
| Terminal | xterm.js 5.5, WebGL renderer | Industry standard, GPU-accelerated |
| Backend | Node.js 20+, Express, ws | Lightweight, WebSocket-native |
| PTY | node-pty | Real terminal sessions, signal forwarding |
| Tunnel | ngrok / SSH / WiFi | 3-tier fallback, no account required |
| Auth | jose (JWT) | No external dependencies |
| Database | better-sqlite3, WAL mode | Zero config, fast reads |
| Monorepo | Turborepo, npm workspaces | Parallel builds, shared types |

The whole thing is about 55 source files. The agent is 11 files. The frontend is 44 (components, hooks, lib, demo engine). There's no build step for the landing page, it's static HTML deployed to Cloudflare Pages.

### What I Learned

**Phone-first is a different design language.** Everything I know about web development assumes a cursor, a keyboard, and hover states. Designing for touch-only required rethinking every interaction. Buttons need to be bigger. Feedback needs to be immediate and visual (not just hover states). Tap targets need spacing.

**xterm.js is incredibly capable.** The WebGL renderer handles ANSI sequences, 256 colors, mouse events, and cursor positioning flawlessly. The addon ecosystem (fit, web-links, search) covers most needs. The buffer API made the colored preview feature possible.

**Sticky modifiers change everything.** This one UX pattern, making modifier keys toggle instead of hold, is the difference between "this is a toy" and "I can actually work from my phone."

**Demo mode is marketing.** The best way to sell a developer tool is to let developers use it immediately, for free, with no signup. Demo mode on the landing page does more for conversion than any amount of copy.

**tmux integration is the secret weapon.** Wrapping PTY sessions in tmux means they survive server restarts. Close your laptop, reopen it, and your sessions are still running. Combined with a static ngrok URL, this means your phone always connects to the same URL and finds its sessions waiting. It feels like a native app.

### What's Next

clsh MVP is local-first: your Mac is the server, ngrok is the tunnel, your phone is the client. That's intentional. Zero cloud dependency, total control.

The roadmap:

1. **Remote machines**: Cloud VMs that are always on, accessible from anywhere
2. **Claude bootstrap**: A script that automatically duplicates your local dev environment (dotfiles, repos, configs) to a remote machine
3. **Teams**: Shared terminal sessions, presence indicators, multiple Claude Code instances working in parallel

The vision is your development environment as a service. Start solo with your Mac, scale to remote machines, graduate to team workspaces. All from your phone.

### Try It

clsh is MIT licensed and open source. One command, zero config, zero signup:

```bash
npx clsh
```

Or try the demo on your phone: [clsh.dev](https://clsh.dev)

GitHub: [github.com/my-claude-utils/clsh](https://github.com/my-claude-utils/clsh)

If you have feedback, ideas, or want to contribute, issues and PRs are open. I'd especially love input on the keyboard UX and what features would make this useful for your workflow.

---

## Publishing Notes

- **Dev.to title**: "How I Built clsh: Phone-First Terminal Access to Your Mac"
- **Cover image**: Phone showing terminal with MacBook keyboard, on dark background
- **Series**: None (standalone)
- **Canonical URL**: Set Dev.to as canonical, cross-post to Hashnode with Dev.to canonical
- **Word count**: ~1,700 words
- **Promotion**: Share on X with "Wrote about how I built clsh" + link. Post in relevant Dev.to/Hashnode communities.
