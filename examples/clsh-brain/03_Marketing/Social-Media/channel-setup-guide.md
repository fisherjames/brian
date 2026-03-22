---
title: Social Channels Setup Guide
tags: #clsh #marketing #social
created: 2026-03-12
---

# Social Channels Setup Guide — clsh.dev

Complete setup guide for all social channels. Follow the checklist at the bottom to get everything live.

**Brand reference**: [[Branding]]
**Social strategy**: [[Social-Media]]

---

## 1. Discord Server Setup

### Server Name
`clsh.dev`

### Server Description
> Open source terminal access from any device. Your Mac, in your pocket.

### Channel Structure

```
clsh.dev Discord
+-- WELCOME
|   +-- #welcome
|   +-- #introductions
|   +-- #announcements
+-- GENERAL
|   +-- #general
|   +-- #show-and-tell
|   +-- #ideas
+-- SUPPORT
|   +-- #help
|   +-- #bug-reports
|   +-- #installation
+-- DEVELOPMENT
|   +-- #contributing
|   +-- #frontend
|   +-- #backend
|   +-- #pull-requests
+-- OFF-TOPIC
    +-- #off-topic
```

### Channel Descriptions

| Channel | Description |
|---------|-------------|
| #welcome | Server rules and getting started. Read this first. |
| #introductions | New here? Tell us who you are and what you're building. |
| #announcements | Releases, updates, and important news. (Read-only for non-staff) |
| #general | Main discussion about clsh, terminal workflows, and dev life. |
| #show-and-tell | Share your clsh setup, screenshots, and creative uses. |
| #ideas | Feature suggestions and "what if" discussions. |
| #help | Need help with clsh? Ask here. Community and maintainers will respond. |
| #bug-reports | Found a bug? Post reproduction steps here. For confirmed bugs, open a GitHub issue. |
| #installation | Trouble installing? System-specific setup questions go here. |
| #contributing | Discussion for contributors — what to work on, how to get started. |
| #frontend | React, xterm.js, Tailwind, WebGL renderer — frontend-specific discussion. |
| #backend | Node.js, node-pty, WebSocket, Express — backend-specific discussion. |
| #pull-requests | PR discussion, reviews, and coordination. Auto-posted by GitHub bot. |
| #off-topic | Anything not clsh-related. Memes welcome, be respectful. |

### Roles

| Role | Color | Permissions | Who Gets It |
|------|-------|-------------|-------------|
| **Maintainer** | `#f97316` (orange) | Admin, manage channels, manage messages, mention @everyone | Core team (founder, core contributors) |
| **Contributor** | `#22c55e` (green) | Send messages, embed links, attach files, use external emoji, add reactions | Anyone who has merged a PR |
| **Community** | Default | Send messages, add reactions, read message history | Everyone on join (auto-assigned) |

### Welcome Message

Post this in #welcome as an embed (orange accent color `#f97316`):

```
Welcome to clsh.dev

One command. Real terminal on your phone. Zero config, zero signup.
npx clsh-dev → Scan QR → Done.

--- Getting Started ---

1. Star the repo: github.com/my-claude-utils/clsh
2. Try the demo: clsh.dev (works without installing anything)
3. Install: npx clsh-dev
4. Read the docs: github.com/my-claude-utils/clsh#readme

--- Quick Links ---

GitHub: github.com/my-claude-utils/clsh
Website: clsh.dev
X: @clsh_dev

--- Rules ---

1. Be respectful. No harassment, hate speech, or personal attacks.
2. Stay on topic in channel-specific rooms.
3. No spam or self-promotion (unless it's genuinely relevant).
4. Use #bug-reports for bugs, GitHub issues for confirmed ones.
5. English is the primary language.
6. Have fun. We're all here because terminals are cool.

--- Contributing ---

Check #contributing for open issues and how to get started.
All skill levels welcome — documentation, testing, and code are all valuable.
```

### Server Rules (for Discord's built-in Rules Screening)

1. Be respectful and kind to everyone.
2. No spam, self-promotion, or unsolicited DMs.
3. Keep discussions on-topic in the appropriate channels.
4. No NSFW content.
5. Use English as the primary language.
6. Follow Discord's Terms of Service.
7. Report issues to moderators, don't engage trolls.

### Bot Recommendations

| Bot | Purpose | Setup Notes |
|-----|---------|-------------|
| **GitHub Bot** (official) | Post PR/issue notifications to #pull-requests and #bug-reports | Connect via GitHub App, select my-claude-utils/clsh repo |
| **MEE6** or **Carl-bot** | Auto-role assignment on join (Community role), welcome DMs | Free tier is sufficient |
| **Disboard** | List server on Disboard for discoverability | Add after 30+ members |

---

## 2. Platform Bios

### X (@clsh_dev)

**Bio** (155 chars):
```
Your Mac, in your pocket. Real terminal on your phone in under a minute. Zero config, zero signup. Open source.
```

**Website**: `https://clsh.dev`

**Location**: `localhost:4030`

**Pinned Tweet Draft (Launch Day)**:
```
Introducing clsh. One command. Real terminal on your phone.

npx clsh-dev

Scan the QR code. You're in.

Zero config. Zero signup. Zero cloud dependency.

Star it: github.com/my-claude-utils/clsh
Try the demo: clsh.dev

#opensource #terminal #devtools
```

### Instagram (@clsh.dev)

**Bio** (148 chars):
```
Your Mac, in your pocket.
Open source terminal access from any device.
Built for developers who live in the terminal.
```

**Link in Bio**: `https://clsh.dev`

**Content Theme**: Terminal aesthetics. Dark backgrounds, orange accents (#f97316), the MacBook Pro frame with three glowing terminal panes. Screenshots of clsh running on phones and tablets. Clean, minimal, code-forward.

### TikTok (@clsh.dev)

**Bio**:
```
Your Mac, in your pocket. Terminal access from your phone. Open source.
```

**Link**: `https://clsh.dev`

**Content Theme**: Short demos of accessing a real terminal from a phone. "Wait, is that a real terminal on your phone?" hooks. Screen recordings of the MacBook frame UI. Side-by-side phone + laptop shots. Build-in-public clips. Keep it raw and authentic — no polish, just terminal vibes.

### GitHub Organization (my-claude-utils)

**Organization Display Name**: `clsh`

**Description**:
```
Your Mac, in your pocket. Browser-based terminal access to your local machine from any device.
```

**Website**: `https://clsh.dev`

**Location**: `The Terminal`

**Email**: (set up a contact email, e.g., hello@clsh.dev)

### Reddit (u/clsh_dev)

**Profile Description**:
```
Building clsh — open source terminal access from any device. Your Mac, in your pocket. github.com/my-claude-utils/clsh
```

---

## 3. Profile Image Guidelines

### Design Spec

All platforms should use the same core profile image for brand consistency:

- **Background**: Solid near-black `#060606`
- **Foreground**: The clsh ASCII logo rendered in orange `#f97316`, or a clean text-based "clsh" in JetBrains Mono Bold
- **Alternative**: The orange pixel-art pig mascot on the `#060606` background (once the mascot SVG is finalized)
- **Style**: Terminal-aesthetic. Think monospace font on a dark terminal. No gradients, no stock imagery. Clean and recognizable at small sizes.
- **Border**: Optional 2px rounded border in `#f97316` (helps visibility on dark platform backgrounds)

### Recommended Format

```
+------------------+
|                  |
|     #060606      |
|    background    |
|                  |
|      clsh        |  <-- JetBrains Mono Bold, #f97316
|                  |
|                  |
+------------------+
```

### Dimensions Per Platform

| Platform | Profile Image | Banner/Header |
|----------|--------------|---------------|
| Discord | 512x512 px (PNG) | 960x540 px |
| X | 400x400 px (PNG) | 1500x500 px |
| Instagram | 320x320 px (PNG) | N/A |
| TikTok | 200x200 px (PNG) | N/A |
| GitHub | 500x500 px (PNG) | N/A |

### Banner/Header Design (X and Discord)

- **Background**: `#060606`
- **Center**: The MacBook Pro frame showing three terminal panes (screenshot from clsh.dev demo)
- **Bottom-right**: `clsh.dev` in small JetBrains Mono, `#f97316`
- **Tagline**: "Your Mac, in your pocket." in white `#ffffff` above or below the frame
- **Dimensions**: X banner is 1500x500, Discord banner is 960x540

Note: Actual image creation is a manual step. These are specs for the designer/founder to follow.

---

## 4. Manual Setup Checklist

### Discord
- [ ] Create Discord server named "clsh.dev"
- [ ] Set server icon (profile image per spec above)
- [ ] Set server banner (MacBook frame screenshot)
- [ ] Create category: WELCOME
  - [ ] Create #welcome (set as read-only for Community role)
  - [ ] Create #introductions
  - [ ] Create #announcements (set as read-only for Community role)
- [ ] Create category: GENERAL
  - [ ] Create #general
  - [ ] Create #show-and-tell
  - [ ] Create #ideas
- [ ] Create category: SUPPORT
  - [ ] Create #help
  - [ ] Create #bug-reports
  - [ ] Create #installation
- [ ] Create category: DEVELOPMENT
  - [ ] Create #contributing
  - [ ] Create #frontend
  - [ ] Create #backend
  - [ ] Create #pull-requests
- [ ] Create category: OFF-TOPIC
  - [ ] Create #off-topic
- [ ] Create role: Maintainer (orange, admin perms)
- [ ] Create role: Contributor (green, standard perms)
- [ ] Create role: Community (default, auto-assigned on join)
- [ ] Enable Community Features (Rules Screening)
- [ ] Add server rules (7 rules listed above)
- [ ] Post welcome message embed in #welcome
- [ ] Add GitHub bot for PR/issue notifications
- [ ] Add auto-role bot (MEE6 or Carl-bot) for Community role on join
- [ ] Create a vanity invite link (discord.gg/clsh if available, else discord.gg/clsh-dev)
- [ ] Enable Server Discovery (once eligible at 1000+ members)

### X (Twitter)
- [ ] Register @clsh_dev account
- [ ] Set profile image (400x400 per spec)
- [ ] Set banner image (1500x500 per spec)
- [ ] Set bio (copy from Section 2)
- [ ] Set website to https://clsh.dev
- [ ] Set location to "localhost:4030"
- [ ] Enable DMs from everyone (for early community)
- [ ] Follow key accounts: @AnthropicAI, @veraborja, @xtaborjax, dev tool accounts
- [ ] Draft pinned launch tweet (copy from Section 2)

### Instagram
- [ ] Register @clsh.dev account
- [ ] Set profile image (320x320 per spec)
- [ ] Set bio (copy from Section 2)
- [ ] Set link to https://clsh.dev
- [ ] Switch to Professional Account (Creator)
- [ ] Set category to "Software"

### TikTok
- [ ] Register @clsh.dev account
- [ ] Set profile image (200x200 per spec)
- [ ] Set bio (copy from Section 2)
- [ ] Set link to https://clsh.dev

### GitHub Organization
- [ ] Create org "my-claude-utils" (if not already done)
- [ ] Set org display name to "clsh"
- [ ] Set org description (copy from Section 2)
- [ ] Set website to https://clsh.dev
- [ ] Set location to "The Terminal"
- [ ] Set org profile image (500x500 per spec)
- [ ] Create repo my-claude-utils/clsh
- [ ] Add repo description: "Your Mac, in your pocket. Browser-based terminal access from any device."
- [ ] Add topics: terminal, developer-tools, xterm, websocket, open-source, remote-access
- [ ] Set up GitHub Discussions on the repo
- [ ] Add CONTRIBUTING.md
- [ ] Add CODE_OF_CONDUCT.md

### Reddit
- [ ] Register u/clsh_dev account
- [ ] Set profile description (copy from Section 2)
- [ ] Set profile image
- [ ] Join subreddits: r/programming, r/webdev, r/SideProject, r/selfhosted, r/commandline, r/opensource

### Cross-Platform
- [ ] Add Discord invite link to GitHub README
- [ ] Add Discord invite link to clsh.dev landing page
- [ ] Add social links to clsh.dev footer (coordinate with frontend-engineer)
- [ ] Create a link-in-bio page or use clsh.dev as the hub linking to all channels

---

## 5. Content Calendar Starter

### Pre-Launch Teasers (1-2 weeks before launch)

**Teaser 1 — "What if" hook** (X, Instagram, TikTok)
```
What if you could open a real terminal on your phone?

Not a toy. Not SSH. A real PTY session with your actual shell, running on your machine.

Building something. Shipping soon.

#devtools #terminal #buildinpublic
```

**Teaser 2 — Screenshot reveal** (X, Instagram)
```
Three terminal panes. One MacBook frame. Accessible from any device.

[Screenshot of clsh.dev MacBook frame UI with three panes active]

Your Mac, in your pocket. Coming soon.
```

**Teaser 3 — Phone demo clip** (TikTok, X, Instagram Reels)
```
[Screen recording: Pick up phone, open browser, navigate to clsh URL, show real terminal]

Caption: "Yes, that's a real terminal on my phone."
```

**Teaser 4 — Build-in-public technical** (X thread)
```
Thread: How we built real terminal access in the browser

1/ We use node-pty to spawn actual PTY sessions — not a simulation
2/ WebSocket streams the output in real time to xterm.js
3/ ngrok creates an auto-tunneled HTTPS URL with QR code
4/ Open it on your phone and you're in

Shipping soon as open source.
```

**Teaser 5 — Claude Code angle** (X)
```
Claude Code is incredible.

But you can't monitor a long-running session from your phone.

Until now.

[Screenshot of Claude Code pane in clsh, viewed on mobile]
```

### Launch Day Posts

**X — Primary Launch**
```
clsh is live.

One command. Real terminal on your phone.

npx clsh-dev

Scan QR → Done.
Zero config. Zero signup.

Star it: github.com/my-claude-utils/clsh
Try the demo: clsh.dev

#opensource #devtools #terminal
```

**X — Thread Follow-up** (reply to launch tweet)
```
What you get:
- Root shell pane
- tmux session pane
- Claude Code pane
- MacBook Pro frame UI
- Auto ngrok tunnel with QR code
- Magic link auth (no passwords)
- Works on phone, tablet, desktop

MIT licensed. Local-first. No cloud required.
```

**Hacker News — Show HN**
```
Title: Show HN: clsh -- Browser-based terminal access to your local machine from any device

clsh gives you three real terminal panes (root shell, tmux, Claude Code) in a MacBook Pro frame UI, accessible from any device through an auto-generated ngrok tunnel.

I built this because I wanted to monitor Claude Code sessions from my phone while walking around. SSH felt too heavy, and there was nothing that gave me real PTY access with a good mobile UI.

Tech stack: React + xterm.js (WebGL) on the frontend, Node.js + node-pty + Express + ws on the backend. Auth via magic links (JWT + Resend). SQLite for local state. Auto-tunneled via ngrok SDK.

Try the demo (no install): https://clsh.dev
GitHub: https://github.com/my-claude-utils/clsh

MIT licensed. Feedback welcome.
```

**Reddit — r/programming, r/selfhosted, r/commandline**
```
Title: I built an open source tool to access my terminal from any device (phone, tablet, desktop)

[Same as HN post, adapted to subreddit tone — more casual for r/selfhosted, more technical for r/programming]
```

**Product Hunt**
```
Tagline: Your Mac, in your pocket.
Description: Browser-based terminal access to your local machine from any device. Three real terminal panes in a MacBook Pro frame — root shell, tmux, and Claude Code — streaming live over WebSocket.
```

**Discord — #announcements**
```
@everyone clsh v0.1.0 is live!

GitHub: github.com/my-claude-utils/clsh
Demo: clsh.dev

Give it a star, try it out, and let us know what you think in #general.
If you find bugs, drop them in #bug-reports.
Want to contribute? Check #contributing.

Thanks for being here from the start.
```

**Instagram — Launch Post**
```
[Screenshot/video of clsh on phone and laptop side by side]

Caption: Your Mac, in your pocket.

clsh is live — open source terminal access from any device. Three real panes. No cloud. No simulation.

Link in bio.

#opensource #terminal #devtools #developer #coding #buildinpublic
```

### Post-Launch Cadence

| Platform | Frequency | Content Type |
|----------|-----------|-------------|
| X | 3-5x/week | Build-in-public updates, feature announcements, community highlights, memes |
| Discord | Daily (passive) | Community support, contributor coordination, release notes |
| Instagram | 2-3x/week | Terminal screenshots, setup showcases, short reels |
| TikTok | 1-2x/week | Demo clips, "did you know" features, phone terminal content |
| Reddit | 1x/week | Technical deep-dives, changelogs (only in relevant subreddits) |
| GitHub | As needed | Release notes, issue responses, PR reviews |

### Recurring Content Ideas

- **"Terminal Tuesday"**: Weekly tip or trick using clsh (X, Instagram)
- **"Contributor Spotlight"**: Highlight a community contributor (Discord, X)
- **"Setup Saturday"**: Community members share their clsh setups (Discord #show-and-tell, X)
- **Changelog posts**: Every release gets a concise X thread + Discord announcement
- **Phone terminal clips**: Short recordings of real terminal usage on mobile (TikTok, Instagram Reels)

---

## Notes

- All bios and content use the brand voice defined in [[Branding]]
- Profile images are manual — use the specs in Section 3
- Coordinate Discord invite link placement with frontend-engineer (landing page) and devops-engineer (README)
- All handles are aspirational — register them ASAP to avoid squatting
- The demo at clsh.dev works without a backend, making it perfect for social proof screenshots
