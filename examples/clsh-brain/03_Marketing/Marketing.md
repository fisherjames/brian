---
title: Marketing Department
tags: #clsh #marketing
created: 2026-03-12
---

# Marketing — clsh.dev

Go-to-market strategy for an open source developer tool launch.

## Subfolders

| Area | Index | Description |
|------|-------|-------------|
| [[Social-Media]] | `03_Marketing/Social-Media/` | Discord, X, Instagram, TikTok |
| [[Content]] | `03_Marketing/Content/` | Blog posts, tutorials, videos |
| [[GTM]] | `03_Marketing/GTM/` | Go-to-market plan |
| [[Branding]] | `03_Marketing/Branding/` | Visual identity, logo, colors |
| [[SEO]] | `03_Marketing/SEO/` | Search optimization for clsh.dev |

## Key Questions

1. Which platform do we launch on first — Product Hunt, Hacker News, or Reddit?
2. What's the content cadence for build-in-public posts?
3. Should we create video content (TikTok/Instagram Reels) showing mobile terminal?
4. How do we drive GitHub stars in the first week?

## Status

**Pre-launch content COMPLETE** — Landing page live at clsh.dev (Cloudflare Pages). Demo video embedded. All launch content drafted:
- `Content/x-thread-how-i-built-clsh.md` — 13-tweet thread
- `Content/hn-show-post.md` — Show HN post
- `Content/reddit-posts.md` — 4 subreddit posts (r/programming, r/webdev, r/commandline, r/SideProject)
- `Content/product-hunt-listing.md` — Full Product Hunt listing
- `Content/blog-launch-post.md` — ~1700 word deep-dive for Dev.to/Hashnode
- `Content/readme-video-section.md` — 3 README embed options

**Social bios finalized** — Unified one-liner for all platforms: "Your Mac, in your pocket. Real terminal on your phone. Open source." + linktr.ee/clsh.dev

**Social accounts created** (linktree live at linktr.ee/clsh.dev):
- X: @clsh_dev
- Instagram: @clsh.dev
- TikTok: @clsh.dev
- Threads: @clsh.dev
- Discord: clsh.dev server

**Posting plan ready** — 5 phone screenshots (grid, claude idle, claude active, terminal, skin studio) with platform-specific captions for X (thread), IG (carousel), TikTok (photo carousel), Threads (carousel), Discord (#announcements).

**Narrative stories ready**:
- `Content/story-the-2am-deploy.md` — Official story, problem-driven (blog, README, LinkedIn)
- `Content/story-a-conversation-that-actually-happened.md` — Funny dialogue (X, Reddit, TikTok)
- `Content/post-ideas-bank.md` — 40+ post ideas for Reddit (7 subreddits), HN, X + 4-week content calendar

**GitHub handle updated** — All codebase files (landing page, video CTA, README, CONTRIBUTING, LICENSE) updated from `clsh-dev/clsh` → `my-claude-utils/clsh`. Verified zero stale references.

**Messaging refreshed** — All marketing copy now leads with ease: "one command", "zero config", "zero signup". Landing page subtitle: "One command. Real terminal on your phone." Quickstart: `npx clsh-dev`.

**Demo video re-rendered** — Updated CTA scene with new tagline ("One command. That's it.") and correct GitHub URL. Compressed 4.4MB → 1.3MB, deployed to Cloudflare Pages.

**Content polished (Session 18)** — All 9 launch content pieces updated with current facts: ~55 source files (was ~30), 6 skins including iOS Terminal default, 3-tier tunnel fallback, tmux session persistence, two keyboard layouts (iOS-style + MacBook). AI agent monitoring (Claude Code, Aider) woven into all pieces as a key by-product use case. Stories updated similarly.

**Facebook + LinkedIn posts ready** — Personal account posts (stream-of-thought narrative) in English and Hebrew for Facebook groups and LinkedIn. `Content/facebook-linkedin-posts.md` with suggested groups and posting notes.

**SetupFlow video created** — New 34-second Remotion composition showing the full "setup to wow" journey: desktop terminal (3 typed commands + QR output) → phone camera scan → grid view → Claude Code session (with pixel pig mascot) → dev server → CTA. Rendered at 1080×1920 9:16 portrait. Both videos archived in `Assets/Social/Videos/` (clsh-demo.mp4 + clsh-setup-flow.mp4).

**Instagram composites created** — 7 images (1080x1350, 4:5 ratio) in `Assets/Social/Instagram/`. Phone screenshots with rounded corners on right, SF NS Mono headlines + brand orange accents on left. Full posting guide with captions, hashtags, and recommended posting order.

**Posted on all socials** — Reddit (5 subreddits: r/ClaudeAI LIVE, r/commandline live, r/SideProject removed by filter, r/programming, r/webdev), Instagram, X, Threads, Discord.

**HN title fixed** — Shortened to 71 chars: "Show HN: clsh – Real terminal on your phone (works with Claude Code)". r/commandline post de-AI'd (removed Claude Code/Aider mentions per Rule 7).

**Influencer outreach plan ready** — Dev influencers identified across tiers (terminal community, tool creators, broad reach) with personalized pitch angles.

**Blog post cleaned up (Session 26)** — Removed all em dashes from `blog-launch-post.md`, softened AI-sounding phrasing ("exercise in frustration" to "miserable", "was radical" to "was kind of radical"). Post now reads more natural/human for Dev.to/Hashnode.

**Threads engagement** — First community comment from @mktpavlenko: "this is barely about the cli, it's about killing the setup tax." Validates zero-friction messaging. Now even simpler: `npx clsh-dev`.

**Reddit lessons learned** — New accounts get auto-flagged by spam filters. Bold headers + bullet lists = AI red flag. r/ClaudeAI requires: "built with Claude BY YOU", how Claude helped, free to try, minimal promo. Casual lowercase tone worked. See `Content/reddit-posts.md` for full strategy.

**Competitor landscape** — Anthropic shipped Remote Control (Feb 2026) requiring Max plan ($100-200/mo), one session at a time, can't start new sessions from mobile, 10-min timeout. clsh differentiates: free/OSS, real terminal (not just Claude conversation), custom keyboard, multiple sessions, no plan required. Also: Happy Coder (open source mobile client), CC Pocket (mobile approvals app), SSH+Tailscale+tmux (DIY).

**All Reddit posts de-AI'd (Session 29)** — Rewrote r/commandline, r/programming, r/webdev posts: removed all em dashes, bold headers, bullet lists. Casual paragraphs only. Added image recommendations per subreddit (r/programming = none, r/commandline = 1, r/SideProject + r/webdev = 2 each).

**Threads Wave 2 content ready** — 10 new posts in `Content/threads-posts.md` (Wave 2): iOS keyboard roast, 20-min walk story, Anthropic pricing comparison, raw phone screenshot, gamer RGB skin, engagement question, demo CTA, overnight session story, vim from toilet humor, 55 files build story. Image capture list included.

**Platform performance (2026-03-15)**: Threads HIGH (100 followers, 100+ likes), Reddit LOW (3 comments on r/ClaudeAI), X/IG/TikTok NONE. Strategy: Threads daily posts, Reddit comment-first (stop posting new threads until karma builds), IG/TikTok paused until short video content ready.

**Google Search Console VERIFIED** (2026-03-15) — clsh.dev is indexed by Google. Sitemap submitted. Verification file deployed. Semrush data will populate in 1-2 weeks.

**"Obsidian as Claude Code's brain" campaign ready (Session 35)** — New content angle: how clsh was built (not what it is). Blog post for Dev.to/Hashnode (`blog-how-i-built-with-obsidian-claude.md`), HN post (`hn-obsidian-brain-post.md`), all social posts in one file (`social-obsidian-brain-all-platforms.md`): Reddit (r/ClaudeAI + r/ObsidianMD + r/SideProject + r/programming), X thread (7 tweets), Threads (brand voice), LinkedIn, Facebook (EN + HE). Cover image with real Obsidian + Claude logos at `Assets/Social/Screenshots/cover-claude-obsidian.png`. 4 vault screenshots (graph, directory, focused-plan, agents). Platform research: Dev.to best for discovery, Hashnode for SEO, r/ObsidianMD highest-value single submission. CTA on all posts: "comment brain and I'll DM you the setup." Posting order: Hashnode (canonical) → Dev.to → HackerNoon → Reddit → HN → Medium → Obsidian Forum.

**Reddit r/ClaudeAI VIRAL (Session 38, 2026-03-17)** — "Obsidian brain" post blew up. DMs flooded with requests for the vault template + commands. Massive demand signal.

**Remaining**: Product Hunt listing, screen recordings for TikTok/Reels, Bing Webmaster Tools, Cloudflare Web Analytics.
