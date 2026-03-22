---
title: Privacy
tags: #clsh #legal #privacy
created: 2026-03-12
---

# Privacy — clsh.dev

Data handling and privacy considerations.

## Data Flows

| Data | Destination | Purpose |
|------|-------------|---------|
| Terminal I/O | WebSocket (ngrok) | Core functionality |
| Bootstrap token hash | Local SQLite | Authentication |
| Session JWT | httpOnly cookie | Session management |
| Email (optional) | Resend API | Magic link auth |
| Page views | Cloudflare Analytics | Landing page analytics (no cookies) |

## Privacy Advantages

- **Local-first**: All data stays on user's machine
- **No telemetry**: Zero tracking in the open source tool
- **No accounts**: Bootstrap token auth requires no signup
- **Cloudflare Analytics**: Cookie-free, privacy-friendly

## TODO

- [ ] Add privacy note to README
- [ ] Create minimal privacy policy for clsh.dev landing page
