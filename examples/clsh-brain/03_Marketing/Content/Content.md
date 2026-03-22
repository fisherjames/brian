---
title: Content
tags: #clsh #marketing #content
created: 2026-03-12
---

# Content — clsh.dev

Content strategy for open source launch and growth.

## Content Types

| Type | Platform | Cadence |
|------|----------|---------|
| Build-in-public threads | X | 2-3x/week during build |
| Demo videos | TikTok, Instagram Reels | 1x/week |
| Technical blog posts | Dev.to, Hashnode | 1x/2 weeks |
| Tutorial: "Access your Mac from your phone" | Blog + YouTube | Launch week |
| Architecture deep-dive | Blog | Launch week |
| "How I built clsh" thread | X | Launch day |

## Key Hooks

- "One command. Your Mac is on your phone."
- "I built a tool that turns your browser into a MacBook terminal"
- "Claude Code on your phone — yes, really"
- The MacBook Pro frame UI is inherently screenshot-worthy

## Current State

**All 9 launch content pieces polished and ready.** Updated across all pieces: 6 skins (iOS Terminal default), 3-tier tunnel fallback, tmux session persistence, ~55 source files, two keyboard layouts. Demo video rendered + embedded at `apps/landing/demo.mp4` (1.2 MB, faststart).

## Remotion Demo Video

**Location**: `apps/demo-video/` in the clsh monorepo
**Stack**: Remotion 4.x, React, TypeScript
**Canvas**: 1080×1920 portrait (9:16), 30fps, 26.7s (800 frames)
**Brand color**: `#f97316` (orange) — matches landing page ASCII logo

### Scenes
| Scene | Frames | Description |
|-------|--------|-------------|
| Intro | 0–100 | iPhone frame + ASCII CLSH logo (exact landing page style) lines stagger in |
| Grid | 80–260 | iPhone slides up, 2×2 tmux grid: claude, kubectl, gcloud, + new session |
| kubectl | 240–475 | iPhone frame + terminal, oh-my-zsh prompt, pods stream in, data flow diagram |
| Claude Code | 455–710 | iPhone frame + MacBook keyboard (fixed: no longer cut off), refactor prompt, diff streams in live |
| CTA | 690–800 | iPhone frame + ASCII logo + `npx clsh-dev` typewriter |

### iPhone Frame Design
**All 5 scenes** now have a consistent iPhone frame:
- `PHONE_SCALE = 1920/852 ≈ 2.254` — phone fits exactly in video height (was 1080/393=2.748 which cut off the keyboard)
- Phone renders at **886×1920** centered in 1080×1920 (97px dark margins on each side)
- Dynamic Island, status bar, home indicator present in all scenes
- Keyboard scene (SceneClaude): home indicator bar added below keyboard so it clears the rounded phone corners

### Commands
```bash
cd apps/demo-video
npm run dev        # Preview in Remotion Studio at localhost:3001
npm run render     # Render to out/demo.mp4 (H.264, CRF 18)
npm run render:web # Render to out/demo.webm (VP9)
```

### Integration TODOs
- [ ] Render to `out/demo.mp4` — run `npm run render` in `apps/demo-video/`
- [ ] Compress: `ffmpeg -i out/demo.mp4 -crf 26 -preset slow -movflags faststart apps/landing/demo.mp4`
- [ ] Add `<video>` tag to `apps/landing/index.html` (autoplay, muted, loop, playsinline)
- [ ] Host video on Cloudflare (served alongside landing page)
- [ ] Add to README.md — either as animated GIF preview or `[Watch demo](https://clsh.dev/demo.mp4)` link
- [ ] Optionally export 15s cut for Instagram Reels / TikTok

## Launch Content Files

All content files are in `03_Marketing/Content/`:

| File | Description | Status |
|------|-------------|--------|
| [[x-thread-how-i-built-clsh]] | 13-tweet X thread, "How I Built clsh" | Ready |
| [[hn-show-post]] | Show HN post — technical, concise | Ready |
| [[reddit-posts]] | 5 subreddit posts (r/ClaudeAI LIVE, r/commandline, r/SideProject, r/programming, r/webdev) | r/ClaudeAI live, others pending |
| [[threads-posts]] | 8 daily posts + reply templates for Threads (PRIMARY channel) | Ready |
| [[product-hunt-listing]] | Full PH listing: tagline, description, maker comment, launch timeline | Ready |
| [[blog-launch-post]] | ~1,700 word Dev.to/Hashnode technical deep-dive | Ready |
| [[readme-video-section]] | Markdown snippet to embed demo video in GitHub README | Ready |
| [[story-the-2am-deploy]] | Official narrative — the problem clsh solves, told through a 2AM incident | Ready |
| [[story-a-conversation-that-actually-happened]] | Funny dialogue — skeptical friend gets won over | Ready |
| [[post-ideas-bank]] | 40+ post ideas for Reddit, HN, and X with platform-specific notes | Ready |
| [[facebook-linkedin-posts]] | Personal FB group + LinkedIn posts (English + Hebrew) | Ready |
| [[blog-how-i-built-with-obsidian-claude]] | "I gave Claude Code a brain" blog post for Dev.to/Hashnode | Ready |
| [[hn-obsidian-brain-post]] | HN post for Obsidian+Claude Code workflow | Ready |
| [[social-obsidian-brain-all-platforms]] | All social posts for "brain" campaign (Reddit, X, Threads, LinkedIn, FB EN+HE) | Ready |

## "One Command" Announcement Campaign (2026-03-15)

New Remotion composition + marketing image for the `npx clsh-dev` one-command quickstart.

| Asset | Location | Spec |
|-------|----------|------|
| OneCommand video | `apps/demo-video/src/scenes/SceneOneCommand.tsx` | 1080x1920, 30fps, 330 frames (11s) |
| Compressed video | `Assets/Social/Videos/one-command.mp4` | 487KB, H.264, CRF 23 |
| Instagram image | `Assets/Social/Instagram/08_one_command.png` | 1080x1350, 4:5 ratio |
| Threads post | [[threads-posts]] Post 19 (Wave 2) | With image + video |
| X tweet | [[threads-posts]] X Post section | Short + long version |
| Discord | #announcements | Posted (Message ID: 1482847328703348786) |

Render: `cd apps/demo-video && npm run render:onecommand`

## TODO

- [x] Build Remotion animated demo video
- [x] Render + compress video to MP4 (4.1MB raw → 1.2MB compressed, faststart)
- [x] Embed video in landing page (`apps/landing/index.html`) — needs layout polish
- [x] Write first build-in-public X thread → `x-thread-how-i-built-clsh.md`
- [x] Draft launch day blog post → `blog-launch-post.md`
- [x] Draft Hacker News "Show HN" post → `hn-show-post.md`
- [x] Draft Reddit posts → `reddit-posts.md`
- [x] Draft Product Hunt listing → `product-hunt-listing.md`
- [x] Draft README video section → `readme-video-section.md`
- [x] Create "One Command" announcement video (Remotion OneCommand composition)
- [x] Create "One Command" Instagram composite image (#08)
- [x] Draft Threads + X posts for one-command announcement
- [x] Post Discord announcement for one-command update
- [ ] Fix video embedding/layout in landing page (new session — see landing page work queue)
- [ ] Add video reference to `README.md`
