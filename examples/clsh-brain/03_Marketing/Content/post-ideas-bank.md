---
title: "Post Ideas Bank"
tags: #clsh #marketing #content #ideas
created: 2026-03-14
updated: 2026-03-14
---

# Post Ideas Bank

Ongoing collection of post ideas organized by platform and angle. Pick, adapt, post.

---

## Reddit Ideas

### r/programming
| # | Title | Angle | Hook |
|---|-------|-------|------|
| 1 | "I replaced the iOS keyboard with a MacBook keyboard for terminal access — here's how" | Technical deep-dive | Keyboard architecture, escape sequences, sticky modifiers |
| 2 | "node-pty vs. exec vs. Docker for web-based terminal sessions" | Educational | Compare approaches, explain why node-pty wins for real PTY |
| 3 | "How I stream terminal output to a phone at 60fps with xterm.js WebGL" | Performance | WebGL renderer, buffer-to-HTML preview pipeline, debouncing |
| 4 | "Building a tmux-style session grid for the browser with headless xterm.js" | Architecture | Headless terminals for previews, cell-by-cell color extraction |
| 5 | "JWT auth without OAuth: one-time bootstrap tokens for self-hosted tools" | Security | Auth design for local-first tools, no third-party dependency |

### r/commandline
| # | Title | Angle | Hook |
|---|-------|-------|------|
| 1 | "What key combos do you use most in the terminal? I'm designing a phone keyboard for it" | Community input | Ask what matters, show the keyboard, get feedback |
| 2 | "I made my Escape key red and my Ctrl key blue. Terminal keyboard skins are a thing now." | Fun / visual | Screenshots of skins, per-key color painting |
| 3 | "The iOS keyboard is the worst thing that ever happened to terminal work. Here's my fix." | Problem-first | Pain point everyone relates to → solution |
| 4 | "Live terminal previews in a grid: how I read xterm.js buffers cell-by-cell" | Technical | Preview system architecture |

### r/webdev
| # | Title | Angle | Hook |
|---|-------|-------|------|
| 1 | "I built a MacBook keyboard as a React component — every key sends real terminal input" | Component architecture | React keyboard component breakdown |
| 2 | "Tailwind v4 CSS-first config: lessons from building a terminal UI" | CSS / Tailwind | Practical Tailwind v4 learnings |
| 3 | "Building a phone-first web app that replaces native keyboard with custom UI" | Mobile UX | Suppressing iOS keyboard, touch events, sticky modifiers |
| 4 | "xterm.js WebGL renderer + React: performance lessons for terminal-in-browser" | Performance | WebGL integration, addon management, resize handling |

### r/SideProject
| # | Title | Angle | Hook |
|---|-------|-------|------|
| 1 | "I built clsh because I kept walking away from my laptop mid-Claude Code session" | Origin story | Personal, relatable, Claude Code angle |
| 2 | "From idea to clsh.dev in 2 weeks: my solo open-source build" | Build-in-public | Timeline, decisions, stack choices, what went wrong |
| 3 | "My side project has keyboard skins and I'm not sorry" | Fun / personality | Screenshots, the joy of unnecessary features |

### r/selfhosted
| # | Title | Angle | Hook |
|---|-------|-------|------|
| 1 | "Self-hosted terminal access from your phone — no cloud, no subscription, MIT license" | Self-hosted angle | Local-first, your machine, your data |
| 2 | "clsh: access your homelab from your phone with a real terminal (not SSH + iOS keyboard)" | Homelab | Practical use case for homelab crowd |

### r/ClaudeAI
| # | Title | Angle | Hook |
|---|-------|-------|------|
| 1 | "I built a tool to monitor Claude Code sessions from my phone" | Claude-specific | Watch Claude work, ctrl+c if needed, type commands |
| 2 | "Claude Code on your phone — actual terminal, not a chat interface" | Demo | Show Claude Code running in clsh on phone |

### r/ProgrammerHumor
| # | Title | Angle | Hook |
|---|-------|-------|------|
| 1 | "The real reason I built a terminal app: so I can deploy from the toilet" | Humor | The conversation story, meme format |
| 2 | "My friend asked 'why not just walk to your laptop?' and I took that personally" | Humor | Last line of the conversation story |
| 3 | "I added RGB lighting to a terminal keyboard. No regrets." | Humor / visual | Screenshot of Gamer RGB skin |

---

## Hacker News Ideas

| # | Title | Angle | Notes |
|---|-------|-------|-------|
| 1 | "Show HN: clsh — Phone-first terminal access to your Mac" | Launch | Already written: [[hn-show-post]] |
| 2 | Comment on "Ask HN: Best mobile dev tools?" threads | Contextual | Drop clsh when someone asks about mobile terminal access |
| 3 | Comment on xterm.js / node-pty / terminal discussions | Technical credibility | Share specific learnings (WebGL rendering, PTY handling) |
| 4 | "The architecture of a phone-first terminal emulator" | Follow-up blog | Post to HN after launch, deeper than Show HN |
| 5 | "Why I chose node-pty over SSH for remote terminal access" | Comparison | Technical decision post, great for HN discussion |

### HN Comment Templates

**When someone asks "why not just SSH?"**
> SSH + the iOS keyboard is miserable for anything beyond `ls`. clsh replaces the iOS keyboard with a real developer keyboard (6-row iOS-style default or MacBook layout — real modifier keys, arrows, tab), adds a tmux-style session grid with live colored previews, and runs on your actual machine via node-pty — so your aliases, your .zshrc, your tools all work. One command to set up (`npx clsh-dev`), no SSH key management. Sessions persist across restarts via tmux.

**When someone mentions mobile terminal apps:**
> I built something for this — clsh.dev. Open source, phone-first. The key insight was replacing the iOS keyboard entirely with a real developer keyboard (two layouts: iOS-style for fast typing, MacBook for full modifier keys). Real ctrl/cmd/opt, arrow keys, the works. Sessions persist via tmux. Works great for monitoring Claude Code / AI agent sessions too — real PTY, so everything terminal-based just works. One command: `npx clsh-dev`. Or try the demo on your phone at clsh.dev (no install needed).

---

## X (Twitter) Ideas

### Standalone Tweets (not threads)
| # | Tweet | Type |
|---|-------|------|
| 1 | "Deployed from the toilet. clsh works." | One-liner |
| 2 | "Every time someone says 'just walk to your laptop' I add another keyboard skin to clsh" | Personality |
| 3 | "The iOS keyboard is terminal abuse. I fixed it." + screenshot | Visual |
| 4 | "My terminal has RGB now. Your move, VS Code." + skin screenshot | Fun |
| 5 | "1 command. That's it. `npx clsh-dev`. Your Mac is now on your phone." | Punchy |
| 6 | "Me: *walks away from laptop*\nClaude Code: *refactors everything*\nMe: *opens clsh on phone*\nMe: ctrl+c\nCrisis averted." | Meme format |
| 7 | "Built a MacBook keyboard as a React component. Every key sends real terminal escape sequences. This was way harder than it sounds." + screenshot | Technical |
| 8 | "The best part of clsh isn't the terminal. It's the feeling of your Mac in your pocket." | Emotional |
| 9 | "Open source idea: what if your phone had a real terminal? Not a chat. Not a web IDE. A real, full terminal. That's clsh." | Manifesto |
| 10 | "I added a per-key color painter to a terminal app. You can paint your Escape key red. I regret nothing." | Fun |

### Thread Ideas (beyond the launch thread)
| # | Thread Topic | Hook |
|---|-------------|------|
| 1 | "How I built clsh in 2 weeks (solo)" | Build-in-public, decisions, tradeoffs |
| 2 | "5 things I learned building a phone-first terminal" | Listicle thread |
| 3 | "The hardest part of clsh wasn't the terminal. It was the keyboard." | Deep-dive on keyboard component |
| 4 | "Why I didn't use SSH" | Technical decision, node-pty vs SSH comparison |
| 5 | "The future of clsh: remote machines, Claude bootstrap, and teams" | Vision / roadmap thread |
| 6 | "I let Claude Code build 70% of clsh. Here's what happened." | AI-assisted development story (if true to your experience) |
| 7 | "Keyboard skins for your terminal: the feature nobody asked for" | Fun thread with screenshots of each skin |

---

## Cross-Platform Content Calendar (Post-Launch)

| Week | Monday | Wednesday | Friday |
|------|--------|-----------|--------|
| 1 | Launch: HN + r/commandline + X thread | r/programming + r/webdev | r/SideProject + r/selfhosted |
| 2 | X: keyboard deep-dive thread | r/ClaudeAI + X one-liner | X: "conversation" story thread |
| 3 | Blog: "Architecture of a phone terminal" → HN | X: skin screenshots | Reddit: community feedback request |
| 4 | X: vision/roadmap thread | r/ProgrammerHumor meme post | X: build-in-public update |

---

## Content Rules

1. **Never post to multiple subreddits the same day** — looks spammy, gets flagged
2. **Screenshots are mandatory** for Reddit and X — phone UI is the hook
3. **HN: no marketing language** — be technical, be honest, acknowledge tradeoffs
4. **X: personality > polish** — the funny/casual stuff performs better than corporate
5. **Always end with the demo link** (clsh.dev) — zero-install try-it-now is the conversion moment
6. **Engage in comments for first 2 hours** — algorithms reward early engagement
7. **r/ProgrammerHumor**: image/meme posts only, text posts die there
