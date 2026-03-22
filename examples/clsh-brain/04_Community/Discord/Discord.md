---
title: Discord
tags: #clsh #community #discord
created: 2026-03-12
---

# Discord — clsh.dev

Community Discord server structure and management.

## Channel Structure

```
clsh.dev Discord
├── WELCOME
│   ├── #welcome — Rules + getting started
│   ├── #introductions — New members introduce themselves
│   └── #announcements — Releases, updates (read-only)
├── GENERAL
│   ├── #general — Main discussion
│   ├── #show-and-tell — Share your clsh setup/screenshots
│   └── #ideas — Feature suggestions
├── SUPPORT
│   ├── #help — Technical support
│   ├── #bug-reports — Bug reports
│   └── #installation — Setup help
├── DEVELOPMENT
│   ├── #contributing — Contributor discussion
│   ├── #frontend — React/xterm.js discussion
│   ├── #backend — Node.js/PTY discussion
│   └── #pull-requests — PR discussion
└── OFF-TOPIC
    └── #off-topic — Non-project chat
```

## Roles

- **Maintainer** — Core team
- **Contributor** — Anyone with merged PR
- **Community** — Everyone else

## Bot

- **Bot name**: clsh-bot
- **Token**: stored in your project's `.env` as `DISCORD_BOT_TOKEN`
- **Permissions**: Manage Server, Manage Roles, Manage Channels, Send Messages, Manage Messages, Pin Messages, Embed Links, Attach Files, Read Message History, Mention Everyone, Add Reactions, Create Instant Invite, Manage Webhooks, View Channels, Manage Events

## Roles

- **Maintainer** (green #2ecc71, hoisted) — Core team
- **Contributor** (blue #3498db, hoisted) — Anyone with merged PR
- **Community** (gray #95a5a6) — Everyone else

## Current State

LIVE — Server fully set up with all channels, roles, and welcome messages (2026-03-14 session 22).

## TODO

- [x] Create Discord server
- [x] Set up channels and roles
- [x] Create welcome message with getting started guide
- [ ] Add Discord invite link to README and website
- [ ] Set up GitHub webhook for PR/issue notifications in #pull-requests
- [ ] Create custom invite link for tracking
